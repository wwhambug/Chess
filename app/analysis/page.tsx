import { AnalysisBoard } from '../../components/AnalysisBoard';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ fen?: string; pgn?: string }>;
}) {
  const { fen, pgn } = await searchParams;
  return <AnalysisBoard initialFen={fen} initialPgn={pgn} />;
}
