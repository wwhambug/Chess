'use client';

// ============================================================
// 대국실: 실시간 체스 대국의 핵심 화면
// - 기보/시계/평가를 Supabase Realtime으로 동기화
// - 로컬 chess.js 인스턴스로 수 합법성 검증 (불법 수는 throw → 스냅백)
// - 내 수를 둔 클라이언트가 evaluateMove로 수 평가 후 moves 행 업데이트
// - 대국 종료 시 각 클라이언트가 자신의 프로필 레이팅만 1회 갱신
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { evaluateMove } from '../lib/evalClient';
import { parseTC } from '../lib/timeControl';
import { acceptChallenge, applyElo } from '../lib/gameLogic';
import type { Challenge, Game, GameStatus, Move, Profile } from '../lib/db';
import { resultReasonLabel } from '../lib/db';
import { useAuth } from './AuthProvider';
import { EvalBar } from './EvalBar';
import { Clock } from './Clock';
import { MoveList } from './MoveList';

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface RoomSnapshot {
  game: Game | null;
  moves: Move[];
  clocks: { w: number; b: number };
  lastAt: number;
  myColor: 'w' | 'b' | null;
}

export function GameRoom({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const configured = isSupabaseConfigured();

  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [fen, setFen] = useState<string>(STARTPOS);
  const [clocks, setClocks] = useState({ w: 0, b: 0 });
  const [lastAt, setLastAt] = useState<number>(() => Date.now());
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rematch, setRematch] = useState<Challenge | null>(null);
  const [myRematch, setMyRematch] = useState<Challenge | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);

  const chessRef = useRef<Chess | null>(null);
  const settleRef = useRef(false); // 레이팅 정산 1회 가드
  const timeoutRef = useRef(false); // 시간패 판정 1회 가드
  const latestPlyRef = useRef(0);
  const evalPendingRef = useRef<Set<number>>(new Set());
  const stateRef = useRef<RoomSnapshot>({
    game: null,
    moves: [],
    clocks: { w: 0, b: 0 },
    lastAt: Date.now(),
    myColor: null,
  });

  const myColor: 'w' | 'b' | null =
    game && user ? (game.white_id === user.id ? 'w' : game.black_id === user.id ? 'b' : null) : null;
  const isParticipant = myColor !== null;
  const opponentId: string | null =
    game && user ? (game.white_id === user.id ? game.black_id : game.white_id) : null;
  const finished = !!game && game.status !== 'ongoing';

  // 비동기 콜백(realtime/인터벌)에서 최신 상태를 읽을 수 있도록 매 렌더마다 미러링
  useEffect(() => {
    stateRef.current = { game, moves, clocks, lastAt, myColor };
  });

  // ------------------------------------------------------------
  // 대국 종료 시 내 프로필 레이팅/전적 정산 (클라이언트당 1회, 본인 행만)
  // ------------------------------------------------------------
  const settleRating = useCallback(
    async (g: Game) => {
      const me = user?.id;
      if (!me) return;
      const isWhite = g.white_id === me;
      if (!isWhite && g.black_id !== me) return;
      const { data } = await supabase
        .from('profiles')
        .select('id, rating, wins, losses, draws')
        .in('id', [g.white_id, g.black_id]);
      const rows = ((data ?? []) as Pick<Profile, 'id' | 'rating' | 'wins' | 'losses' | 'draws'>[]);
      const wRow = rows.find((r) => r.id === g.white_id);
      const bRow = rows.find((r) => r.id === g.black_id);
      const result: 'w' | 'b' | 'draw' =
        g.status === 'white_won' ? 'w' : g.status === 'black_won' ? 'b' : 'draw';
      const { white, black } = applyElo(wRow?.rating ?? 800, bRow?.rating ?? 800, result);
      const myNewRating = isWhite ? white : black;
      const counterKey: 'wins' | 'losses' | 'draws' =
        result === 'draw' ? 'draws' : (result === 'w') === isWhite ? 'wins' : 'losses';
      const myRow = isWhite ? wRow : bRow;
      const { error } = await supabase
        .from('profiles')
        .update({ rating: myNewRating, [counterKey]: (myRow?.[counterKey] ?? 0) + 1 })
        .eq('id', me);
      if (!error) {
        setProfiles((prev) => {
          const old = prev[me];
          if (!old) return prev;
          return { ...prev, [me]: { ...old, rating: myNewRating, [counterKey]: old[counterKey] + 1 } };
        });
      }
    },
    [user?.id],
  );

  // ------------------------------------------------------------
  // 초기 로드: 대국 + 기보 + 프로필 + 리매치 도전 확인
  // ------------------------------------------------------------
  useEffect(() => {
    if (authLoading || !user || !configured) return;
    let cancelled = false;
    (async () => {
      const { data: g, error: gErr } = await supabase.from('games').select('*').eq('id', gameId).single();
      if (cancelled) return;
      if (gErr || !g) {
        setNotFound(true);
        return;
      }
      const gameRow = g as Game;
      // 이미 종료된 대국을 불러온 경우: 레이팅은 과거에 정산된 것으로 보고 가드 고정
      if (gameRow.status !== 'ongoing') {
        settleRef.current = true;
        timeoutRef.current = true;
      }
      setGame(gameRow);

      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .in('id', [gameRow.white_id, gameRow.black_id]);
      if (cancelled) return;
      const map: Record<string, Profile> = {};
      for (const row of ((p ?? []) as Profile[])) map[row.id] = row;
      setProfiles(map);

      const { data: m } = await supabase
        .from('moves')
        .select('*')
        .eq('game_id', gameId)
        .order('ply', { ascending: true });
      if (cancelled) return;
      const moveRows = ((m ?? []) as Move[]).sort((a, b) => a.ply - b.ply);
      setMoves(moveRows);
      const last = moveRows[moveRows.length - 1];
      const lastFen = last?.fen_after ?? STARTPOS;
      try {
        chessRef.current = new Chess(lastFen);
      } catch {
        chessRef.current = new Chess();
      }
      setFen(lastFen);
      const tc = parseTC(gameRow.time_control);
      setClocks({ w: last?.white_clock_ms ?? tc.baseMs, b: last?.black_clock_ms ?? tc.baseMs });
      setLastAt(last ? new Date(last.moved_at).getTime() : new Date(gameRow.created_at).getTime());
      latestPlyRef.current = moveRows.length;

      // 진행 중인 리매치 도전이 있는지 확인 (내가 보낸 것 / 받은 것)
      const me = user.id;
      const opp = gameRow.white_id === me ? gameRow.black_id : gameRow.white_id;
      const { data: rm } = await supabase
        .from('challenges')
        .select('*')
        .eq('creator_id', me)
        .eq('invitee_id', opp)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled && rm && rm.length > 0) setMyRematch(rm[0] as Challenge);
      const { data: irm } = await supabase
        .from('challenges')
        .select('*')
        .eq('creator_id', opp)
        .eq('invitee_id', me)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled && irm && irm.length > 0) setRematch(irm[0] as Challenge);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, gameId, configured]);

  // ------------------------------------------------------------
  // Realtime: moves INSERT/UPDATE + games UPDATE 구독
  // ------------------------------------------------------------
  useEffect(() => {
    if (authLoading || !user || !configured || notFound) return;
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'moves', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as Move;
          setMoves((prev) => {
            const next = prev.filter((m) => m.ply !== row.ply);
            next.push(row);
            next.sort((a, b) => a.ply - b.ply);
            return next;
          });
          // 내가 둔 수의 realtime 에코(같은 ply)는 무시, 새 수만 반영
          if (row.ply > latestPlyRef.current) {
            latestPlyRef.current = row.ply;
            try {
              chessRef.current?.load(row.fen_after ?? STARTPOS);
            } catch {
              /* 무시 */
            }
            setFen(row.fen_after ?? STARTPOS);
            setClocks({ w: row.white_clock_ms, b: row.black_clock_ms });
            setLastAt(new Date(row.moved_at).getTime());
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'moves', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as Move;
          setMoves((prev) => prev.map((m) => (m.ply === row.ply ? row : m)));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          setGame(payload.new as Game);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authLoading, user?.id, gameId, configured, notFound]);

  // ------------------------------------------------------------
  // Realtime: 리매치 도전 INSERT/UPDATE 구독
  // ------------------------------------------------------------
  useEffect(() => {
    if (authLoading || !user || !configured || !game) return;
    const me = user.id;
    const opp = game.white_id === me ? game.black_id : game.white_id;
    const channel = supabase
      .channel(`rematch:${gameId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'challenges' }, (payload) => {
        const c = payload.new as Challenge;
        if (c.creator_id === opp && c.invitee_id === me && c.status === 'open') setRematch(c);
        if (c.creator_id === me && c.invitee_id === opp && c.status === 'open') setMyRematch(c);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'challenges' }, (payload) => {
        const c = payload.new as Challenge;
        setMyRematch((prev) => (prev && prev.id === c.id ? c : prev));
        setRematch((prev) => (prev && prev.id === c.id ? (c.status === 'open' ? c : null) : prev));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authLoading, user?.id, gameId, configured, game?.id]);

  // 내가 보낸 리매치가 수락되면 새 대국으로 이동
  useEffect(() => {
    if (myRematch?.status === 'accepted' && myRematch.game_id) {
      router.push(`/play/${myRematch.game_id}`);
    }
  }, [myRematch, router]);

  // ------------------------------------------------------------
  // 대국 종료 감지 → 레이팅 정산 (가드: 클라이언트당 1회)
  // ------------------------------------------------------------
  useEffect(() => {
    if (game && game.status !== 'ongoing' && !settleRef.current) {
      settleRef.current = true;
      void settleRating(game);
    }
  }, [game, settleRating]);

  // ------------------------------------------------------------
  // 시계: 100ms 틱 + 시간패 판정
  // ------------------------------------------------------------
  useEffect(() => {
    const iv = setInterval(() => {
      if (timeoutRef.current) return;
      const s = stateRef.current;
      const g = s.game;
      if (!g || g.status !== 'ongoing') return;
      setTick((t) => t + 1);
      const now = Date.now();
      const elapsed = now - s.lastAt;
      const wLeft = g.turn === 'w' ? s.clocks.w - elapsed : s.clocks.w;
      const bLeft = g.turn === 'b' ? s.clocks.b - elapsed : s.clocks.b;
      if ((g.turn === 'w' && wLeft <= 0) || (g.turn === 'b' && bLeft <= 0)) {
        timeoutRef.current = true;
        const winner: GameStatus = g.turn === 'w' ? 'black_won' : 'white_won';
        const finishedAt = new Date().toISOString();
        setGame((prev) =>
          prev ? { ...prev, status: winner, result_reason: 'timeout', finished_at: finishedAt } : prev,
        );
        void supabase
          .from('games')
          .update({ status: winner, result_reason: 'timeout', finished_at: finishedAt })
          .eq('id', gameId)
          .eq('status', 'ongoing');
      }
    }, 100);
    return () => clearInterval(iv);
  }, [gameId]);

  // ------------------------------------------------------------
  // 수 평가: 내 수를 둔 뒤 비동기로 평가 → 해당 ply 행 업데이트
  // (그 사이 새 수가 나왔다면 평가가 낡았으므로 업데이트 생략)
  // ------------------------------------------------------------
  const fireEval = useCallback(
    async (beforeFen: string, uci: string, afterFen: string, ply: number) => {
      if (evalPendingRef.current.has(ply)) return;
      evalPendingRef.current.add(ply);
      try {
        const res = await evaluateMove(beforeFen, uci, afterFen);
        const s = stateRef.current;
        const latest = s.moves[s.moves.length - 1];
        if (latest && latest.ply === ply) {
          await supabase
            .from('moves')
            .update({ annotation: res.annotation, eval_cp: Math.round(res.evalAfterCp) })
            .eq('game_id', gameId)
            .eq('ply', ply);
        }
      } catch {
        // 평가는 best-effort: 실패해도 대국 진행에 영향 없음
      } finally {
        evalPendingRef.current.delete(ply);
      }
    },
    [gameId],
  );

  // ------------------------------------------------------------
  // 수 두기
  // ------------------------------------------------------------
  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    const s = stateRef.current;
    const g = s.game;
    if (!g || g.status !== 'ongoing' || !targetSquare || !user) return false;
    if (s.myColor == null || s.myColor !== g.turn) return false;
    const chess = chessRef.current;
    if (!chess) return false;

    const beforeFen = chess.fen();
    let mv;
    try {
      // 프로모션은 자동 퀸
      mv = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false; // 불법 수 → 스냅백
    }

    const now = Date.now();
    const elapsed = now - s.lastAt;
    const tc = parseTC(g.time_control);
    const mover = g.turn;
    let wClock = s.clocks.w;
    let bClock = s.clocks.b;
    if (mover === 'w') wClock = Math.max(0, wClock - elapsed + tc.incMs);
    else bClock = Math.max(0, bClock - elapsed + tc.incMs);

    const ply = latestPlyRef.current + 1;
    const uci = `${sourceSquare}${targetSquare}${mv.promotion ?? ''}`;
    const afterFen = chess.fen();

    latestPlyRef.current = ply;
    const optimistic: Move = {
      id: `local-${ply}-${now}`,
      game_id: gameId,
      ply,
      color: mover,
      san: mv.san,
      uci,
      fen_after: afterFen,
      annotation: null,
      eval_cp: null,
      white_clock_ms: wClock,
      black_clock_ms: bClock,
      moved_at: new Date(now).toISOString(),
    };
    setMoves((prev) => [...prev.filter((m) => m.ply !== ply), optimistic].sort((a, b) => a.ply - b.ply));
    setFen(afterFen);
    setClocks({ w: wClock, b: bClock });
    setLastAt(now);

    void (async () => {
      const { data: inserted, error } = await supabase
        .from('moves')
        .insert({
          game_id: gameId,
          ply,
          color: mover,
          san: mv.san,
          uci,
          fen_after: afterFen,
          white_clock_ms: wClock,
          black_clock_ms: bClock,
        })
        .select('*')
        .single();
      if (!error && inserted) {
        const real = inserted as Move;
        setMoves((prev) => prev.map((m) => (m.ply === real.ply ? real : m)));
      } else if (error) {
        // 수 저장 실패를 조용히 넘기지 않음 ("무브가 안 만들어져" 진단용)
        setToast(`수 저장 실패: ${error.message}`);
      }
      await supabase.from('games').update({ fen: afterFen, turn: chess.turn() }).eq('id', gameId);

      // 대국 종료 판정
      let status: GameStatus | null = null;
      let reason: Game['result_reason'] = null;
      if (chess.isCheckmate()) {
        status = mover === 'w' ? 'white_won' : 'black_won';
        reason = 'checkmate';
      } else if (chess.isStalemate()) {
        status = 'draw';
        reason = 'stalemate';
      } else if (chess.isThreefoldRepetition() || chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) {
        status = 'draw';
        reason = null; // 자동 무승부 규정 (50수/3회 동형 반복/기물 부족)
      }
      if (status) {
        const finishedAt = new Date().toISOString();
        setGame((prev) =>
          prev ? { ...prev, status: status as GameStatus, result_reason: reason, finished_at: finishedAt } : prev,
        );
        await supabase
          .from('games')
          .update({ status, result_reason: reason, finished_at: finishedAt })
          .eq('id', gameId)
          .eq('status', 'ongoing');
      }
      void fireEval(beforeFen, uci, afterFen, ply);
    })();

    return true;
  };

  // ------------------------------------------------------------
  // 기권 / 무승부 제안·응답
  // ------------------------------------------------------------
  const resign = async () => {
    const s = stateRef.current;
    if (!s.game || s.game.status !== 'ongoing' || s.myColor == null) return;
    if (!window.confirm('정말 기권하시겠습니까?')) return;
    const status: GameStatus = s.myColor === 'w' ? 'black_won' : 'white_won';
    const finishedAt = new Date().toISOString();
    setGame((prev) =>
      prev ? { ...prev, status, result_reason: 'resign', finished_at: finishedAt } : prev,
    );
    await supabase
      .from('games')
      .update({ status, result_reason: 'resign', finished_at: finishedAt })
      .eq('id', gameId)
      .eq('status', 'ongoing');
  };

  const offerDraw = async () => {
    if (!user) return;
    await supabase.from('games').update({ draw_offer_by: user.id }).eq('id', gameId).eq('status', 'ongoing');
  };

  const cancelDrawOffer = async () => {
    await supabase.from('games').update({ draw_offer_by: null }).eq('id', gameId);
  };

  const respondDraw = async (accept: boolean) => {
    if (accept) {
      const finishedAt = new Date().toISOString();
      setGame((prev) =>
        prev
          ? { ...prev, status: 'draw' as GameStatus, result_reason: 'agreement' as const, draw_offer_by: null, finished_at: finishedAt }
          : prev,
      );
      await supabase
        .from('games')
        .update({ status: 'draw', result_reason: 'agreement', draw_offer_by: null, finished_at: finishedAt })
        .eq('id', gameId)
        .eq('status', 'ongoing');
    } else {
      await supabase.from('games').update({ draw_offer_by: null }).eq('id', gameId);
    }
  };

  // ------------------------------------------------------------
  // 리매치
  // ------------------------------------------------------------
  const sendRematch = async () => {
    const s = stateRef.current;
    if (!s.game || !user || s.myColor == null || !opponentId || myRematch) return;
    const { data, error } = await supabase
      .from('challenges')
      .insert({
        creator_id: user.id,
        invitee_id: opponentId,
        time_control: s.game.time_control,
        color_choice: s.myColor === 'w' ? 'black' : 'white',
        status: 'open',
      })
      .select('*')
      .single();
    if (error || !data) {
      setToast('리매치 신청에 실패했습니다.');
      return;
    }
    setMyRematch(data as Challenge);
  };

  const cancelRematch = async () => {
    if (!myRematch) return;
    await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', myRematch.id);
    setMyRematch(null);
  };

  const acceptRematch = async () => {
    if (!rematch || !user) return;
    try {
      const newId = await acceptChallenge(supabase, rematch, user.id);
      router.push(`/play/${newId}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '리매치 수락에 실패했습니다.');
      setRematch(null);
    }
  };

  // ------------------------------------------------------------
  // PGN 복사
  // ------------------------------------------------------------
  const copyPgn = async () => {
    if (!game) return;
    const white = profiles[game.white_id]?.username ?? '?';
    const black = profiles[game.black_id]?.username ?? '?';
    const result =
      game.status === 'white_won' ? '1-0' : game.status === 'black_won' ? '0-1' : game.status === 'draw' ? '1/2-1/2' : '*';
    const date = game.created_at.slice(0, 10).replaceAll('-', '.');
    let pgn =
      `[Event "Rated game"]\n[Site "chess-site"]\n[Date "${date}"]\n` +
      `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n`;
    for (let i = 0; i < moves.length; i += 2) {
      pgn += `${i / 2 + 1}. ${moves[i].san ?? ''}${moves[i + 1] ? ` ${moves[i + 1].san ?? ''}` : ''} `;
    }
    pgn += result;
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast('PGN 복사에 실패했습니다.');
    }
  };

  // 토스트 자동 닫힘
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------------------
  // 파생 상태: 표시용 FEN/평가/시계/결과 문구
  // ------------------------------------------------------------
  const liveMode = viewPly == null;
  const displayFen = liveMode
    ? fen
    : viewPly === 0
      ? STARTPOS
      : (moves[viewPly - 1]?.fen_after ?? STARTPOS);
  const displayEval: number | null = liveMode
    ? (moves[moves.length - 1]?.eval_cp ?? null)
    : viewPly === 0
      ? null
      : (moves[viewPly - 1]?.eval_cp ?? null);

  const nowMs = Date.now();
  const clockFrozen = !game || game.status !== 'ongoing';
  const elapsedNow = clockFrozen ? 0 : nowMs - lastAt;
  const wMs = game && game.turn === 'w' && !clockFrozen ? Math.max(0, clocks.w - elapsedNow) : clocks.w;
  const bMs = game && game.turn === 'b' && !clockFrozen ? Math.max(0, clocks.b - elapsedNow) : clocks.b;

  const canPlay = isParticipant && game?.status === 'ongoing' && myColor === game?.turn && liveMode;

  const viewedLastMove = liveMode
    ? moves[moves.length - 1]
    : viewPly === 0
      ? undefined
      : moves[viewPly - 1];
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    const u = viewedLastMove?.uci;
    if (u && u.length >= 4) {
      const hl: CSSProperties = { backgroundColor: 'rgba(155, 199, 0, 0.45)' };
      styles[u.slice(0, 2)] = hl;
      styles[u.slice(2, 4)] = hl;
    }
    return styles;
  }, [viewedLastMove]);

  const resultInfo = (): { title: string; detail: string } | null => {
    if (!game || game.status === 'ongoing' || myColor == null) return null;
    if (game.status === 'draw') return { title: '무승부', detail: resultReasonLabel(game.result_reason) };
    const iWon = (game.status === 'white_won') === (myColor === 'w');
    return { title: iWon ? '승리!' : '패배', detail: resultReasonLabel(game.result_reason) };
  };
  const result = resultInfo();

  const goView = (delta: number) => {
    const cur = viewPly ?? moves.length;
    const next = Math.max(0, Math.min(moves.length, cur + delta));
    setViewPly(next === moves.length ? null : next);
  };

  // ------------------------------------------------------------
  // 렌더
  // ------------------------------------------------------------
  if (!configured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[#9ccbf5]">Supabase 미설정</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          아직 Supabase 접속 정보가 설정되지 않았습니다.
          <br />
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">.env.local</code> 파일에
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs"> NEXT_PUBLIC_SUPABASE_URL</code>과
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs"> NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를
          설정해 주세요. (자세한 순서는 README.md 참조)
        </p>
      </div>
    );
  }

  if (authLoading) {
    return <p className="px-4 py-16 text-center text-sm text-neutral-500">불러오는 중…</p>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-neutral-400">대국을 보려면 로그인이 필요합니다.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-md bg-[#3692e7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4a9fee]"
        >
          로그인하기
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-semibold text-neutral-300">대국을 찾을 수 없습니다.</p>
        <p className="mt-2 text-sm text-neutral-500">삭제되었거나 참가자만 볼 수 있는 대국입니다.</p>
        <Link href="/lobby" className="mt-4 inline-block text-sm text-[#3692e7] hover:text-[#4a9fee]">
          ← 로비로 돌아가기
        </Link>
      </div>
    );
  }

  if (!game) {
    return <p className="px-4 py-16 text-center text-sm text-neutral-500">대국 불러오는 중…</p>;
  }

  if (!isParticipant) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-semibold text-neutral-300">이 대국의 참가자가 아닙니다.</p>
        <p className="mt-2 text-sm text-neutral-500">대국은 백/흑 참가자만 볼 수 있습니다.</p>
        <Link href="/lobby" className="mt-4 inline-block text-sm text-[#3692e7] hover:text-[#4a9fee]">
          ← 로비로 돌아가기
        </Link>
      </div>
    );
  }

  const topId = myColor === 'w' ? game.black_id : game.white_id;
  const bottomId = myColor === 'w' ? game.white_id : game.black_id;
  const topMs = myColor === 'w' ? bMs : wMs;
  const bottomMs = myColor === 'w' ? wMs : bMs;
  const topActive = !clockFrozen && game.turn !== myColor;
  const bottomActive = !clockFrozen && game.turn === myColor;
  const profileName = (id: string) => {
    const p = profiles[id];
    return p ? `${p.username} (${p.rating})` : '…';
  };

  const iOfferedDraw = game.draw_offer_by === user.id;
  const oppOfferedDraw = game.draw_offer_by != null && game.draw_offer_by === opponentId;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-200 shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 왼쪽: 보드 영역 */}
        <div className="mx-auto w-full max-w-[640px] flex-1">
          <div className="mb-2">
            <Clock ms={topMs} active={topActive} label={profileName(topId)} />
          </div>
          <div className="overflow-hidden rounded-lg shadow-2xl">
            <Chessboard
              options={{
                position: displayFen,
                boardOrientation: myColor === 'b' ? 'black' : 'white',
                allowDragging: canPlay,
                canDragPiece: ({ piece }) =>
                  canPlay && (piece.pieceType[0]?.toLowerCase() ?? '') === myColor,
                onPieceDrop,
                squareStyles,
                darkSquareStyle: { backgroundColor: '#b58863' },
                lightSquareStyle: { backgroundColor: '#f0d9b5' },
                showNotation: true,
                animationDurationInMs: 150,
              }}
            />
          </div>
          <div className="mt-2">
            <Clock ms={bottomMs} active={bottomActive} label={profileName(bottomId)} />
          </div>

          {/* 대국 중 버튼 */}
          {!finished && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={resign}
                className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-900/40"
              >
                기권
              </button>
              {oppOfferedDraw ? (
                <div className="flex items-center gap-2 rounded-md border border-[#3692e7]/40 bg-[#3692e7]/10 px-3 py-1.5 text-sm">
                  <span className="text-[#9ccbf5]">상대가 무승부를 제안했습니다</span>
                  <button
                    onClick={() => respondDraw(true)}
                    className="rounded bg-[#3692e7] px-2 py-0.5 text-xs font-semibold text-white hover:bg-[#4a9fee]"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => respondDraw(false)}
                    className="rounded border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700"
                  >
                    거절
                  </button>
                </div>
              ) : iOfferedDraw ? (
                <button
                  onClick={cancelDrawOffer}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  무승부 제안 취소
                </button>
              ) : (
                <button
                  onClick={offerDraw}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  무승부 제안
                </button>
              )}
            </div>
          )}

          {/* 종료 후: 수순 탐색 */}
          {finished && moves.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setViewPly(0)}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
                title="처음으로"
              >
                ⏮
              </button>
              <button
                onClick={() => goView(-1)}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
                title="이전 수"
              >
                ◀
              </button>
              <button
                onClick={() => goView(1)}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
                title="다음 수"
              >
                ▶
              </button>
              <button
                onClick={() => setViewPly(null)}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
                title="최종局面으로"
              >
                ⏭
              </button>
              <span className="ml-1 text-xs text-neutral-500">
                {liveMode ? `최종 (${moves.length}수)` : `${viewPly} / ${moves.length}수`}
              </span>
            </div>
          )}
        </div>

        {/* 오른쪽: 평가 막대 + 사이드 패널 */}
        <aside className="flex w-full gap-3 lg:w-80">
          <EvalBar cp={displayEval} />
          <div className="flex min-h-[420px] flex-1 flex-col rounded-lg border border-neutral-800 bg-[#1b1a17]">
            {result && (
              <div className="border-b border-neutral-800 px-4 py-3 text-center">
                <p
                  className={`text-xl font-bold ${result.title === '승리!' ? 'text-green-400' : result.title === '패배' ? 'text-red-400' : 'text-neutral-200'}`}
                >
                  {result.title}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{result.detail}</p>
                {/* 리매치 영역 */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {rematch ? (
                    <button
                      onClick={acceptRematch}
                      className="rounded-md bg-[#3692e7] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4a9fee]"
                    >
                      리매치 수락
                    </button>
                  ) : myRematch ? (
                    <>
                      <span className="text-xs text-neutral-400">리매치 대기 중…</span>
                      <button
                        onClick={cancelRematch}
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={sendRematch}
                      className="rounded-md bg-[#3692e7] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4a9fee]"
                    >
                      리매치
                    </button>
                  )}
                  <Link href="/lobby" className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800">
                    새 대결
                  </Link>
                </div>
              </div>
            )}
            <div className="max-h-[380px] flex-1 overflow-y-auto">
              <MoveList moves={moves} />
            </div>
            <div className="border-t border-neutral-800 p-2">
              <button
                onClick={copyPgn}
                className="w-full rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                {copied ? '복사됨!' : 'PGN 복사'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
