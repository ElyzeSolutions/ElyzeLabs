import type { SessionRow } from './types';

export function isMissionControlVisibleSession(session: SessionRow): boolean {
  const key = session.sessionKey.toLowerCase();
  const metadata = session.metadata ?? {};
  const isVirtualOfficeAnchor = metadata.virtualOfficeAnchor === true || key === 'office:ceo-hq';
  return !isVirtualOfficeAnchor;
}
