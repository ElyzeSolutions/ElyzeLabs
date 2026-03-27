import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { OfficePresenceRow } from '../../app/types';

// --- Constants & Config ---
const TILE = 32;
const COLS = 32;
const ROWS = 20;
const CANVAS_WIDTH = COLS * TILE; // 1024
const CANVAS_HEIGHT = ROWS * TILE; // 640

const PALETTES = [
  { shirt: '#FF5733', hair: '#333' }, // Red
  { shirt: '#33FF57', hair: '#6c3b00' }, // Green
  { shirt: '#3357FF', hair: '#d4af37' }, // Blue
  { shirt: '#FF33F5', hair: '#111' }, // Pink
  { shirt: '#F5FF33', hair: '#eee' }, // Yellow
  { shirt: '#33FFF5', hair: '#555' }, // Cyan
  { shirt: '#FF8833', hair: '#222' }, // Orange
  { shirt: '#8833FF', hair: '#444' }, // Purple
  { shirt: '#FFFFFF', hair: '#888' }, // White
];

const STATE_COLOR: Record<OfficePresenceRow['state'], string> = {
  active: '#3fb950',
  waiting_input: '#d29922',
  blocked: '#f85149',
  permission_needed: '#f778ba',
  offline: '#6e7681',
};

// Map agent names to desk item types
const getAgentRole = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('ceo') || n.includes('orchestrator') || n.includes('chief')) return 'shield';
  if (n.includes('research')) return 'globe';
  if (n.includes('writ')) return 'books';
  if (n.includes('dev') || n.includes('code')) return 'coffee';
  if (n.includes('design')) return 'palette';
  if (n.includes('video')) return 'camera';
  if (n.includes('motion')) return 'waveform';
  if (n.includes('qa') || n.includes('test')) return 'shield';
  if (n.includes('scout')) return 'fire';
  
  // Hash fallback
  const roles = ['coffee', 'books', 'globe', 'palette'];
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash += n.charCodeAt(i);
  return roles[hash % roles.length];
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

type HangoutZone = 'kitchen' | 'lounge';

const HANGOUT_SPOTS: Record<HangoutZone, { label: string; spots: { x: number; y: number }[] }> = {
  kitchen: {
    label: 'Kitchen',
    spots: [
      { x: 19 * TILE, y: 4 * TILE },
      { x: 20 * TILE, y: 5 * TILE },
      { x: 21 * TILE, y: 4 * TILE },
      { x: 22 * TILE, y: 5 * TILE },
    ],
  },
  lounge: {
    label: 'Lounge',
    spots: [
      { x: 26 * TILE, y: 4 * TILE },
      { x: 27 * TILE, y: 6 * TILE },
      { x: 28 * TILE, y: 8 * TILE },
      { x: 27 * TILE, y: 11 * TILE },
    ],
  },
};

const getHangoutZone = (
  agentId: string,
  state: OfficePresenceRow['state']
): HangoutZone => {
  if (state === 'waiting_input' || state === 'permission_needed') {
    return 'kitchen';
  }
  if (state === 'blocked') {
    return 'lounge';
  }
  return hashString(agentId) % 2 === 0 ? 'kitchen' : 'lounge';
};

const getHangoutDestination = (
  agentId: string,
  state: OfficePresenceRow['state']
): { zone: HangoutZone; x: number; y: number } => {
  const zone = getHangoutZone(agentId, state);
  const palette = HANGOUT_SPOTS[zone].spots;
  const anchor = palette[hashString(`${agentId}:${zone}`) % palette.length];
  return { zone, x: anchor.x, y: anchor.y };
};

const buildIdleActivityLabel = (
  agentId: string,
  state: OfficePresenceRow['state'],
  zone: HangoutZone
): string => {
  const kitchenLines = [
    'arguing with the espresso machine',
    'performing snack drawer QA',
    'running a coffee throughput test',
    'microwaving suspicious leftovers',
    'pretending the kettle is a sprint board',
  ];
  const loungeLines = [
    'power lounging between missions',
    'holding the bean bag line',
    'staring at the ceiling for breakthroughs',
    'rebooting on the couch',
    'doing strategic nothing very intensely',
  ];

  if (state === 'waiting_input') {
    return zone === 'kitchen'
      ? 'hovering by the coffee machine for your reply'
      : 'camped on the couch waiting for your reply';
  }
  if (state === 'permission_needed') {
    return zone === 'kitchen'
      ? 'holding a latte hostage until approval lands'
      : 'guarding the bean bag until approval lands';
  }
  if (state === 'blocked') {
    return zone === 'kitchen'
      ? 'blaming the dependency graph over coffee'
      : 'in the lounge blaming dependencies';
  }

  const lines = zone === 'kitchen' ? kitchenLines : loungeLines;
  return lines[hashString(`${agentId}:${state}`) % lines.length];
};

const buildLShapePath = (
  fromX: number,
  _fromY: number,
  toX: number,
  toY: number
): { x: number; y: number }[] => [
  { x: fromX, y: toY },
  { x: toX, y: toY },
];

// --- Types ---
interface AgentEntity {
  id: string;
  name: string;
  state: OfficePresenceRow['state'];
  colorIndex: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  deskX: number;
  deskY: number;
  roleItem: string;
  isWorking: boolean;
  frame: number;
  frameTimer: number;
  activityLabel: string;
  hangoutZone: HangoutZone;
  contextOnly: boolean;
  path: { x: number; y: number }[]; // Waypoints
}

interface Desk {
  id: string;
  col: number;
  row: number;
  assigned: boolean;
}

export function RetroOfficeSim({
  presence,
  ceoAgentIds = [],
  isSessionNavigable,
  onSelectSession,
}: {
  presence: OfficePresenceRow[];
  ceoAgentIds?: string[];
  isSessionNavigable: (sessionId: string) => boolean;
  onSelectSession: (sessionId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const entitiesRef = useRef<AgentEntity[]>([]);
  const hoverRef = useRef<string | null>(null);
  const ceoSet = useMemo(() => new Set(ceoAgentIds), [ceoAgentIds]);
  const isCeoOrchestrator = useCallback((agentId: string): boolean => {
    if (ceoSet.has(agentId)) {
      return true;
    }
    const id = agentId.toLowerCase();
    return id.includes('ceo') || id.includes('orchestrator');
  }, [ceoSet]);
  const canNavigateSession = useCallback(
    (sessionId: string): boolean => isSessionNavigable(sessionId),
    [isSessionNavigable]
  );
  const sessionNavigableByAgent = useMemo(
    () =>
      new Map(
        presence.map((entry) => [entry.agentId, canNavigateSession(entry.sessionId)])
      ),
    [presence, canNavigateSession]
  );
  
  // 4x2 grid of cubicles on the left + CEO desk in Boss Office
  const desks = useMemo<Desk[]>(() => {
    const d: Desk[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        d.push({
          id: `desk-${col}-${row}`,
          col: 3 + col * 4,
          row: 10 + row * 5,
          assigned: false,
        });
      }
    }
    // Add Boss Desk manually
    d.push({
      id: 'desk-boss',
      col: 13,
      row: 3,
      assigned: false,
    });
    return d;
  }, []);

  // Sync presence to entities
  useEffect(() => {
    const currentMap = new Map(entitiesRef.current.map((e) => [e.id, e]));
    for (const desk of desks) {
      desk.assigned = false;
    }
    const presentAgentIds = new Set(presence.map((item) => item.agentId));
    for (const entity of entitiesRef.current) {
      if (!presentAgentIds.has(entity.id)) {
        continue;
      }
      const occupiedDesk = desks.find((desk) => desk.col * TILE === entity.deskX && desk.row * TILE === entity.deskY);
      if (occupiedDesk) {
        occupiedDesk.assigned = true;
      }
    }
    const bossDesk = desks.find((desk) => desk.id === 'desk-boss') ?? desks[0];
    const regularDesks = desks.filter((desk) => desk.id !== 'desk-boss');
    const bossX = bossDesk.col * TILE;
    const bossY = bossDesk.row * TILE;
    
    // Sort so 'ceo' / 'orchestrator' agents are processed first, ensuring they get the boss desk
    const sortedPresence = [...presence].sort((a, b) => {
      const aIsCeo = isCeoOrchestrator(a.agentId);
      const bIsCeo = isCeoOrchestrator(b.agentId);
      if (aIsCeo && !bIsCeo) return -1;
      if (!aIsCeo && bIsCeo) return 1;
      return 0;
    });

    const availableDesks = desks.filter((d) => !d.assigned);
    let colorCounter = 0;

    const newEntities = sortedPresence.map((p) => {
      let ent = currentMap.get(p.agentId);
      const isWorking = p.state === 'active';
      const isCeo = isCeoOrchestrator(p.agentId);
      const contextOnly = !canNavigateSession(p.sessionId);
      const shortName = isCeo ? 'CEO' : p.agentId.split('-')[0] || p.agentId;
      const idleDestination = !isWorking && !isCeo ? getHangoutDestination(p.agentId, p.state) : null;
      const idleZone = idleDestination?.zone ?? getHangoutZone(p.agentId, p.state);
      
      if (!ent) {
        // New agent
        let desk: Desk | undefined;
        if (isCeo) {
          desk = availableDesks.find(d => d.id === 'desk-boss');
          if (desk) availableDesks.splice(availableDesks.indexOf(desk), 1);
        }
        
        if (!desk) {
          // Find any regular desk, avoiding boss desk unless desperate
          desk = availableDesks.find(d => d.id !== 'desk-boss') || availableDesks[0] || desks[0];
          if (desk && availableDesks.includes(desk)) {
             availableDesks.splice(availableDesks.indexOf(desk), 1);
          }
        }
        
        if (desk) desk.assigned = true;
        
        ent = {
          id: p.agentId,
          name: shortName,
          state: p.state,
          colorIndex: colorCounter++ % PALETTES.length,
          x: idleDestination?.x ?? desk.col * TILE,
          y: idleDestination?.y ?? desk.row * TILE,
          targetX: idleDestination?.x ?? desk.col * TILE,
          targetY: idleDestination?.y ?? desk.row * TILE,
          deskX: desk.col * TILE,
          deskY: desk.row * TILE,
          roleItem: getAgentRole(shortName),
          isWorking,
          frame: 0,
          frameTimer: 0,
          activityLabel: isWorking || isCeo
            ? p.activityLabel || 'Idle'
            : buildIdleActivityLabel(p.agentId, p.state, idleZone),
          hangoutZone: idleDestination?.zone ?? 'lounge',
          contextOnly,
          path: [],
        };
      } else {
        // Update existing
        ent.state = p.state;
        ent.isWorking = isWorking;
        ent.hangoutZone = idleDestination?.zone ?? ent.hangoutZone;
        ent.activityLabel = isWorking || isCeo
          ? p.activityLabel || 'Idle'
          : buildIdleActivityLabel(p.agentId, p.state, ent.hangoutZone);
        ent.contextOnly = contextOnly;
      }

      if (isCeo) {
        ent.deskX = bossX;
        ent.deskY = bossY;
      } else if (ent.deskX === bossX && ent.deskY === bossY && regularDesks.length > 0) {
        const fallbackDesk = regularDesks[hashString(p.agentId) % regularDesks.length];
        ent.deskX = fallbackDesk.col * TILE;
        ent.deskY = fallbackDesk.row * TILE;
      }

      // Logic for targeting and pathing
      if (isCeo || ent.isWorking) {
        if (ent.targetX !== ent.deskX || ent.targetY !== ent.deskY) {
          // Manhattan pathing to desk
          ent.path = buildLShapePath(ent.x, ent.y, ent.deskX, ent.deskY);
          ent.targetX = ent.deskX;
          ent.targetY = ent.deskY;
        }
      } else if (idleDestination) {
        const shouldParkInHangout =
          Math.abs(ent.targetX - idleDestination.x) > 1 ||
          Math.abs(ent.targetY - idleDestination.y) > 1 ||
          Math.hypot(ent.x - idleDestination.x, ent.y - idleDestination.y) > TILE / 2;

        if (shouldParkInHangout) {
          ent.path = buildLShapePath(ent.x, ent.y, idleDestination.x, idleDestination.y);
          ent.targetX = idleDestination.x;
          ent.targetY = idleDestination.y;
        }
      }
      return ent;
    });

    entitiesRef.current = newEntities;
  }, [presence, desks, isCeoOrchestrator, canNavigateSession]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    let animationId: number;
    let lastTime = performance.now();
    let clock = 0;

    const render = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1); 
      lastTime = time;
      clock += dt;
      // Slow day cycle (clock updates)

      // Update entities
      for (const ent of entitiesRef.current) {
        if (ent.path.length > 0) {
          const nextPt = ent.path[0];
          const dx = nextPt.x - ent.x;
          const dy = nextPt.y - ent.y;
          const dist = Math.hypot(dx, dy);
          
          if (dist > 2) {
            const speed = ent.state === 'permission_needed' ? 30 : 60; // Walk slower if blocked/waiting
            ent.x += (dx / dist) * speed * dt;
            ent.y += (dy / dist) * speed * dt;
            
            ent.frameTimer += dt;
            if (ent.frameTimer > 0.15) {
              ent.frame = (ent.frame + 1) % 4;
              ent.frameTimer = 0;
            }
          } else {
            ent.path.shift(); // Reached waypoint
            if (ent.path.length === 0) ent.frame = 0;
          }
        } else {
          // At final target
          ent.frameTimer += dt;
          if (ent.isWorking && ent.frameTimer > 0.2) {
            ent.frame = (ent.frame + 1) % 2; // 2-frame typing animation
            ent.frameTimer = 0;
          } else if (!ent.isWorking) {
            ent.frame = 0; // idle standing
          }
        }
      }

      // --- Draw Background ---
      ctx.fillStyle = '#060a13'; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Checkered Floor (Retro Navy/Dark)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#0d1320' : '#111827';
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }

      // Grid overlay
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r <= ROWS; r++) {
        ctx.moveTo(0, r * TILE);
        ctx.lineTo(CANVAS_WIDTH, r * TILE);
      }
      for (let c = 0; c <= COLS; c++) {
        ctx.moveTo(c * TILE, 0);
        ctx.lineTo(c * TILE, CANVAS_HEIGHT);
      }
      ctx.stroke();

      // --- Draw Rooms ---
      const drawRoom = (col: number, row: number, w: number, h: number, name: string, floorColor: string, wallColor: string) => {
        // Floor
        ctx.fillStyle = floorColor;
        ctx.fillRect(col * TILE, row * TILE, w * TILE, h * TILE);
        
        // Walls
        ctx.fillStyle = wallColor;
        // North wall
        ctx.fillRect(col * TILE, row * TILE - 8, w * TILE, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; // Top edge highlight
        ctx.fillRect(col * TILE, row * TILE - 8, w * TILE, 2);

        // Border outline
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 2;
        ctx.strokeRect(col * TILE, row * TILE, w * TILE, h * TILE);
        
        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(name, (col + w/2) * TILE, row * TILE + Math.min(h*TILE/2, 40));
      };

      drawRoom(2, 1, 8, 6, 'CONFERENCE', '#101622', '#1a2333');
      drawRoom(11, 1, 6, 6, 'BOSS OFFICE', '#161022', '#231a33');
      drawRoom(18, 1, 6, 6, 'KITCHEN', '#102216', '#1a3323');
      drawRoom(25, 1, 6, 18, 'LOUNGE', '#1c1610', '#332a1a');

      // --- Draw Furniture ---
      const drawPlant = (cx: number, cy: number) => {
        ctx.fillStyle = '#6B4E0A'; // Pot
        ctx.fillRect(cx - 6, cy + 4, 12, 10);
        ctx.fillStyle = '#3fb950'; // Leaves
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2ea043'; // Detail
        ctx.beginPath();
        ctx.ellipse(cx, cy - 2, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      // Conf Room Table
      ctx.fillStyle = '#8b5a2b';
      ctx.beginPath();
      ctx.ellipse(6 * TILE, 4 * TILE, TILE * 2.5, TILE * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a06a38';
      ctx.beginPath();
      ctx.ellipse(6 * TILE, 4 * TILE - 2, TILE * 2.3, TILE * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Boss Desk Surface
      ctx.fillStyle = '#4a3224';
      ctx.fillRect(13 * TILE - 4, 3 * TILE - 4, TILE + 8, TILE / 2);
      ctx.fillStyle = '#5c4033'; // Highlight edge
      ctx.fillRect(13 * TILE - 4, 3 * TILE - 4, TILE + 8, 2);
      
      // Boss Items
      ctx.fillStyle = '#111'; // Monitor
      ctx.fillRect(13 * TILE + 4, 3 * TILE - 12, 16, 16);
      ctx.fillStyle = '#3794ff'; // Screen
      ctx.fillRect(13 * TILE + 6, 3 * TILE - 10, 12, 10);
      drawPlant(15 * TILE, 2 * TILE);
      drawPlant(12 * TILE, 4 * TILE);

      
      // Kitchen Counters & Fridge
      ctx.fillStyle = '#e1e4e8'; // Cabinets
      ctx.fillRect(18 * TILE, 1 * TILE, TILE * 4, TILE);
      ctx.fillStyle = '#c9d1d9'; // Fridge
      ctx.fillRect(22 * TILE, 1 * TILE, TILE, TILE * 1.5);
      
      // Lounge items
      ctx.fillStyle = '#8a2be2'; // Bean bags
      ctx.beginPath(); ctx.ellipse(26.5 * TILE, 16 * TILE, 14, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6347';
      ctx.beginPath(); ctx.ellipse(28.5 * TILE, 17 * TILE, 14, 12, 0, 0, Math.PI * 2); ctx.fill();
      
      // Water cooler
      ctx.fillStyle = '#444';
      ctx.fillRect(25 * TILE, 2 * TILE, 16, 24);
      ctx.fillStyle = '#3794ff';
      ctx.fillRect(25 * TILE + 2, 2 * TILE - 12, 12, 16); // Bottle
      drawPlant(29 * TILE, 2 * TILE);
      drawPlant(29 * TILE, 18 * TILE);

      // --- Draw Desks ---
      const drawDeskItem = (cx: number, cy: number, type: string) => {
        ctx.save();
        ctx.translate(cx, cy);
        if (type === 'coffee') {
          ctx.fillStyle = '#fff'; ctx.fillRect(-4, -4, 8, 8); // Mug
          ctx.fillStyle = '#6c3b00'; ctx.fillRect(-2, -2, 4, 4); // Coffee
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          const steamY = Math.sin(clock * 5) * 2;
          ctx.fillRect(-1, -8 + steamY, 2, 3); // Steam
        } else if (type === 'globe') {
          ctx.fillStyle = '#888'; ctx.fillRect(-2, -2, 4, 6); // Stand
          ctx.fillStyle = '#3794ff'; ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#3fb950'; ctx.fillRect(-3, -8, 4, 4); // Land
        } else if (type === 'books') {
          ctx.fillStyle = '#f85149'; ctx.fillRect(-6, -4, 4, 8);
          ctx.fillStyle = '#58a6ff'; ctx.fillRect(-2, -3, 4, 7);
          ctx.fillStyle = '#3fb950'; ctx.fillRect(2, -5, 4, 9);
        } else if (type === 'palette') {
          ctx.fillStyle = '#d29922'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#f85149'; ctx.fillRect(-4, -2, 2, 2);
          ctx.fillStyle = '#3fb950'; ctx.fillRect(0, -3, 2, 2);
          ctx.fillStyle = '#58a6ff'; ctx.fillRect(3, 0, 2, 2);
        } else if (type === 'camera') {
          ctx.fillStyle = '#222'; ctx.fillRect(-6, -4, 12, 8);
          ctx.fillStyle = '#888'; ctx.fillRect(-2, -6, 4, 2);
          ctx.fillStyle = '#58a6ff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2); ctx.fill();
        } else if (type === 'waveform') {
          ctx.fillStyle = '#222'; ctx.fillRect(-6, -4, 12, 8);
          ctx.fillStyle = '#3fb950';
          const h1 = 2 + Math.sin(clock * 8) * 2;
          const h2 = 3 + Math.cos(clock * 10) * 2;
          ctx.fillRect(-4, -h1/2, 2, h1);
          ctx.fillRect(0, -h2/2, 2, h2);
          ctx.fillRect(4, -h1/2, 2, h1);
        } else if (type === 'shield') {
          ctx.fillStyle = '#888';
          ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.lineTo(0, 5); ctx.fill();
          ctx.fillStyle = '#58a6ff';
          ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.lineTo(0, 3); ctx.fill();
        } else if (type === 'fire') {
          ctx.fillStyle = '#f85149';
          ctx.beginPath(); ctx.arc(0, 2, 6, 0, Math.PI); ctx.lineTo(0, -6); ctx.fill();
          ctx.fillStyle = '#d29922';
          const fy = Math.sin(clock * 15) * 2;
          ctx.beginPath(); ctx.arc(0, 2, 3, 0, Math.PI); ctx.lineTo(0, -2 + fy); ctx.fill();
        }
        ctx.restore();
      };

      for (const d of desks) {
        // Desk shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(d.col * TILE - 2, d.row * TILE + 4, TILE + 4, Math.floor(TILE / 2));
        
        // Desk surface
        ctx.fillStyle = '#4a3224';
        ctx.fillRect(d.col * TILE - 4, d.row * TILE - 4, TILE + 8, TILE / 2);
        ctx.fillStyle = '#5c4033'; // Highlight edge
        ctx.fillRect(d.col * TILE - 4, d.row * TILE - 4, TILE + 8, 2);

        // Monitor Base
        ctx.fillStyle = '#222';
        ctx.fillRect(d.col * TILE + 4, d.row * TILE - 12, 16, 16);
        // Screen
        const flicker = Math.random() > 0.95 ? '#2784ff' : '#3794ff';
        ctx.fillStyle = d.assigned ? flicker : '#111'; // Off if unassigned
        ctx.fillRect(d.col * TILE + 6, d.row * TILE - 10, 12, 10);
        // Code lines on screen
        if (d.assigned) {
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fillRect(d.col * TILE + 7, d.row * TILE - 8, 8, 1);
          ctx.fillRect(d.col * TILE + 7, d.row * TILE - 6, 6, 1);
          ctx.fillRect(d.col * TILE + 7, d.row * TILE - 4, 10, 1);
        }
        
        // Render custom item if assigned
        const ent = entitiesRef.current.find(e => e.deskX === d.col * TILE && e.deskY === d.row * TILE);
        if (ent) {
          drawDeskItem(d.col * TILE - 12, d.row * TILE + 2, ent.roleItem);
        }
      }

      // --- Draw Entities ---
      const sorted = [...entitiesRef.current].sort((a, b) => a.y - b.y);

      for (const ent of sorted) {
        const pal = PALETTES[ent.colorIndex];
        const cx = ent.x + TILE/2;
        const cy = ent.y + TILE/2;

        ctx.save();
        ctx.translate(cx, cy);

        // Hover effect highlight
        const isHovered = hoverRef.current === ent.id;
        if (isHovered) {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.beginPath();
          ctx.ellipse(0, TILE/2, 18, 8, 0, 0, Math.PI*2);
          ctx.fill();
        }

        // Draw shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(0, TILE/2 - 4, 10, 4, 0, 0, Math.PI*2);
        ctx.fill();

        const isMoving = ent.path.length > 0;
        
        // Z-bounce logic
        let bounce = 0;
        if (isMoving) bounce = (ent.frame % 2 === 0) ? -2 : 0;
        
        // Sitting offset
        const sitOffset = (ent.isWorking && !isMoving) ? 4 : 0;
        const finalBounce = bounce + sitOffset;

        // Pants
        ctx.fillStyle = '#222';
        ctx.fillRect(-6, 4 + finalBounce, 12, 10);

        // Legs
        if (isMoving) {
          if (ent.frame === 1) {
            ctx.fillRect(-6, 14 + bounce, 4, 6);
            ctx.fillRect(2, 10 + bounce, 4, 6);
          } else if (ent.frame === 3) {
            ctx.fillRect(-6, 10 + bounce, 4, 6);
            ctx.fillRect(2, 14 + bounce, 4, 6);
          } else {
            ctx.fillRect(-6, 14 + bounce, 4, 6);
            ctx.fillRect(2, 14 + bounce, 4, 6);
          }
        } else {
          if (ent.isWorking) {
            // Sitting legs bent forward
            ctx.fillRect(-6, 12 + sitOffset, 12, 6);
          } else {
            // Idle standing
            ctx.fillRect(-6, 14, 4, 6);
            ctx.fillRect(2, 14, 4, 6);
          }
        }

        // Shirt
        ctx.fillStyle = pal.shirt;
        ctx.fillRect(-8, -6 + finalBounce, 16, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; // Shading
        ctx.fillRect(-8, 4 + finalBounce, 16, 2);

        // Arms
        ctx.fillStyle = '#ffcc99'; // Skin
        if (ent.isWorking && !isMoving) {
          // Arms forward typing, animated
          const typeY = ent.frame === 0 ? 0 : 2;
          ctx.fillRect(-10, -4 + sitOffset + typeY, 4, 8);
          ctx.fillRect(6, -4 + sitOffset - typeY, 4, 8);
        } else if (isMoving) {
          // Arm swing
          if (ent.frame === 1) {
            ctx.fillRect(-10, -4 + bounce, 4, 10);
            ctx.fillRect(6, -4 + bounce, 4, 6);
          } else if (ent.frame === 3) {
            ctx.fillRect(-10, -4 + bounce, 4, 6);
            ctx.fillRect(6, -4 + bounce, 4, 10);
          } else {
            ctx.fillRect(-10, -4 + bounce, 4, 8);
            ctx.fillRect(6, -4 + bounce, 4, 8);
          }
        } else {
          // Arms at side
          ctx.fillRect(-10, -4, 4, 10);
          ctx.fillRect(6, -4, 4, 10);
        }

        // Head
        ctx.fillStyle = '#ffcc99';
        ctx.fillRect(-6, -16 + finalBounce, 12, 12);
        
        // Hair
        ctx.fillStyle = pal.hair;
        ctx.fillRect(-8, -18 + finalBounce, 16, 6);
        ctx.fillRect(-8, -12 + finalBounce, 4, 4);

        // Eyes
        ctx.fillStyle = '#111';
        ctx.fillRect(-3, -12 + finalBounce, 2, 2);
        ctx.fillRect(1, -12 + finalBounce, 2, 2);

        // Activity label stays visible so idle agents read as part of the room.
        {
          const isAlert = ent.state === 'waiting_input' || ent.state === 'permission_needed';
          
          // Animate floating
          const floatY = Math.sin(clock * 4 + hashString(ent.id)) * 2;
          
          ctx.fillStyle = isAlert ? '#24292e' : '#f0f6fc';
          ctx.strokeStyle = isAlert ? STATE_COLOR[ent.state] : '#30363d';
          const padding = 6;
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          
          // Add emoji for alert states
          let prefix = '';
          if (ent.state === 'waiting_input') prefix = '⏳ ';
          if (ent.state === 'permission_needed') prefix = '⚠️ ';
          
          const labelText = prefix + ent.activityLabel;
          const tw = ctx.measureText(labelText).width;
          
          const labelY = -42 + finalBounce + floatY;
          
          ctx.beginPath();
          ctx.roundRect(-tw/2 - padding, labelY - 10, tw + padding*2, 14, 4);
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = isAlert ? '#f0f6fc' : '#24292e';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, 0, labelY);
        }

        // Name plate
        if (isHovered && !ent.isWorking) {
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.fillRect(-24, -32 + finalBounce, 48, 12);
          ctx.fillStyle = '#fff';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(ent.name, 0, -23 + finalBounce);
        }

        // Status dot (always visible above head)
        ctx.fillStyle = STATE_COLOR[ent.state] || '#ccc';
        ctx.beginPath();
        ctx.arc(0, -24 + finalBounce, 3, 0, Math.PI * 2);
        ctx.fill();

        if (ent.contextOnly) {
          const badgeText = 'CTX';
          ctx.font = 'bold 7px "JetBrains Mono", monospace';
          const badgeWidth = ctx.measureText(badgeText).width + 6;
          const badgeX = 9;
          const badgeY = -31 + finalBounce;
          ctx.fillStyle = '#78350f';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, 10, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fbbf24';
          ctx.textAlign = 'left';
          ctx.fillText(badgeText, badgeX + 3, badgeY + 7);
        }

        ctx.restore();
      }

      // --- Draw Overlay Effects ---
      // Scanlines (Retro CRT effect)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      for (let y = 0; y < CANVAS_HEIGHT; y += 4) {
        ctx.fillRect(0, y, CANVAS_WIDTH, 2);
      }

      // Vignette
      const gradient = ctx.createRadialGradient(
        CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_HEIGHT/3,
        CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH/1.5
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [desks]);

  // Handle Mouse interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      let found = null;
      for (const ent of entitiesRef.current) {
        const ex = ent.x + TILE/2;
        const ey = ent.y + TILE/2;
        if (Math.abs(x - ex) < 20 && Math.abs(y - ey) < 30) {
          found = ent.id;
          break;
        }
      }
      
      if (found !== hoverRef.current) {
        hoverRef.current = found;
        canvas.style.cursor = found && sessionNavigableByAgent.get(found) ? 'pointer' : 'default';
      }
    };

    const handleMouseClick = () => {
      if (hoverRef.current) {
        const p = presence.find(p => p.agentId === hoverRef.current);
        if (p && canNavigateSession(p.sessionId)) {
          onSelectSession(p.sessionId);
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleMouseClick);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleMouseClick);
    };
  }, [presence, onSelectSession, canNavigateSession, sessionNavigableByAgent]);

  return (
    <div className="w-full flex flex-col gap-4 h-full relative">
      <div className="rounded-xl border border-slate-700 bg-[#060a13] p-1.5 overflow-hidden shadow-2xl relative w-full h-full flex-1">
        <div className="w-full h-full overflow-hidden relative z-10 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="rounded-lg shadow-inner max-w-full max-h-full object-contain bg-black"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </div>
      
      {/* Bottom Bar for Statuses */}
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800/60 bg-slate-900/60 p-2.5 items-center absolute bottom-4 left-4 right-4 z-20 pointer-events-auto">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mr-2">Team Roster</span>
        {presence.map((p, idx) => {
          const pal = PALETTES[idx % PALETTES.length];
          const isCeo = isCeoOrchestrator(p.agentId);
          const shortName = isCeo ? 'CEO' : p.agentId.split('-')[0];
          const role = isCeo ? 'executive' : getAgentRole(shortName);
          const isNavigable = canNavigateSession(p.sessionId);
          
          return (
            <div 
              key={p.id} 
              className={`flex items-center gap-2 rounded-md bg-slate-800/90 px-2.5 py-1 border border-slate-700/50 shadow-sm transition-all ${
                isNavigable
                  ? 'cursor-pointer hover:bg-slate-700 hover:scale-105'
                  : 'cursor-not-allowed opacity-70'
              }`}
              onClick={() => {
                if (!isNavigable) {
                  return;
                }
                onSelectSession(p.sessionId);
              }}
              title={isNavigable ? 'Open session' : 'Context-only session (not listed in Sessions)'}
            >
              <div 
                className="w-2.5 h-2.5 rounded-full shadow-[0_0_5px_currentColor]" 
                style={{ backgroundColor: STATE_COLOR[p.state], color: STATE_COLOR[p.state] }} 
                title={p.state}
              />
              <span className="text-xs font-mono font-medium text-slate-200">
                {shortName}
              </span>
              {!isNavigable ? (
                <span className="rounded border border-amber-700/60 bg-amber-950/70 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-amber-300">
                  CTX
                </span>
              ) : null}
              <span className="text-[10px] text-slate-500 italic lowercase ml-1">
                {role}
              </span>
              <div 
                className="w-3 h-3 rounded-sm ml-1 opacity-90 border border-black/30" 
                style={{ backgroundColor: pal.shirt }} 
                title="Shirt Color"
              />
            </div>
          );
        })}
        {presence.length === 0 && (
          <span className="text-xs font-mono text-slate-600 py-1">Simulation Offline...</span>
        )}
      </div>
    </div>
  );
}
