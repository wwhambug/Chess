import { use } from 'react';
import { GameRoom } from '@/components/GameRoom';

export const dynamic = 'force-dynamic';

export default function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <GameRoom gameId={id} />;
}
