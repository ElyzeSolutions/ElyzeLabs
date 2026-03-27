import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { AgentProfileRow, OfficePresenceRow } from '../../app/types';
import { AGENT_TEAM_ORDER, resolveAgentTeam } from '../../lib/agentTeams';

// --- Types ---
type NodeType = 'root' | 'team' | 'agent';

interface OrgNode {
  id: string;
  type: NodeType;
  label: string;
  subLabel?: string;
  contextOnly?: boolean;
  state?: OfficePresenceRow['state'];
  isActive?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  parent?: OrgNode;
  children: OrgNode[];
  sessionId?: string;
  hexCode: string;
}

// --- Layout Config ---
const NODE_WIDTH_AGENT = 150;
const NODE_HEIGHT_AGENT = 46;
const NODE_WIDTH_TEAM = 160;
const NODE_HEIGHT_TEAM = 36;
const NODE_WIDTH_ROOT = 220;
const NODE_HEIGHT_ROOT = 48;
const NODE_SPACING_X = 30;
const LEVEL_SPACING_Y = 120;

const hasDefaultCeoSignature = (agentId: string): boolean => {
  const id = agentId.toLowerCase();
  return id.includes('ceo') || id.includes('orchestrator');
};

const getHex = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return '0x' + (Math.abs(hash) & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
};

const STATE_COLOR: Record<OfficePresenceRow['state'], string> = {
  active: '#39d2c0', // Cyan
  waiting_input: '#d29922', // Amber
  blocked: '#f85149', // Red
  permission_needed: '#f778ba', // Pink
  offline: '#6e7681', // Gray
};

export function CyberOrgChart({
  presence,
  agentProfiles,
  ceoAgentIds = [],
  ceoDisplayName = 'CEO',
  isSessionNavigable,
  onSelectSession,
}: {
  presence: OfficePresenceRow[];
  agentProfiles: AgentProfileRow[];
  ceoAgentIds?: string[];
  ceoDisplayName?: string;
  isSessionNavigable: (sessionId: string) => boolean;
  onSelectSession: (sessionId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<OrgNode[]>([]);
  const hoverRef = useRef<string | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const ceoSet = useMemo(() => new Set(ceoAgentIds), [ceoAgentIds]);
  const profileByAgentId = useMemo(
    () => new Map(agentProfiles.map((profile) => [profile.id, profile])),
    [agentProfiles]
  );
  const isCeoOrchestrator = useCallback((agentId: string): boolean => ceoSet.has(agentId) || hasDefaultCeoSignature(agentId), [ceoSet]);
  const canNavigateSession = useCallback(
    (sessionId: string): boolean => isSessionNavigable(sessionId),
    [isSessionNavigable]
  );

  // Rebuild the org tree whenever presence changes
  useEffect(() => {
    const ceoPresence = presence.find((p) => isCeoOrchestrator(p.agentId));
    const ceoName = ceoDisplayName.trim() || 'CEO';
    const ceoContextOnly = ceoPresence ? !canNavigateSession(ceoPresence.sessionId) : false;

    const root: OrgNode = { 
      id: 'ceo',
      type: 'root',
      label: ceoName.toUpperCase(),
      subLabel: ceoPresence?.activityLabel || ceoPresence?.state || 'ORCHESTRATING',
      state: ceoPresence?.state,
      isActive: ceoPresence?.state === 'active',
      x: 0, y: 0, width: NODE_WIDTH_ROOT, height: NODE_HEIGHT_ROOT, 
      children: [],
      hexCode: ceoPresence ? getHex(ceoPresence.agentId) : '0x000000',
      contextOnly: ceoContextOnly,
      sessionId: ceoPresence?.sessionId && canNavigateSession(ceoPresence.sessionId) ? ceoPresence.sessionId : undefined
    };

    const presentTeams = Array.from(
      new Set(
        presence
          .filter((entry) => !isCeoOrchestrator(entry.agentId))
          .map((entry) =>
            resolveAgentTeam({
              agentId: entry.agentId,
              name: profileByAgentId.get(entry.agentId)?.name,
              title: profileByAgentId.get(entry.agentId)?.title,
              metadata: profileByAgentId.get(entry.agentId)?.metadata,
            })
          )
      )
    ).sort(
      (left, right) =>
        AGENT_TEAM_ORDER.indexOf(left) - AGENT_TEAM_ORDER.indexOf(right)
    );

    const teamNodes: Record<string, OrgNode> = {};
    presentTeams.forEach((t) => {
      teamNodes[t] = { 
        id: `team_${t}`, type: 'team', label: `DEPT: ${t}`, 
        x: 0, y: 0, width: NODE_WIDTH_TEAM, height: NODE_HEIGHT_TEAM, 
        parent: root, children: [], hexCode: getHex(t) 
      };
      root.children.push(teamNodes[t]);
    });

    presence.forEach(p => {
      if (isCeoOrchestrator(p.agentId)) {
        return;
      }

      const profile = profileByAgentId.get(p.agentId);
      const shortName = p.agentId.split('-')[0] || p.agentId;
      const tName = resolveAgentTeam({
        agentId: p.agentId,
        name: profile?.name ?? shortName,
        title: profile?.title,
        metadata: profile?.metadata,
      });
      const tNode = teamNodes[tName];
      const contextOnly = !canNavigateSession(p.sessionId);
      
      const agentNode: OrgNode = {
        id: p.agentId,
        type: 'agent',
        label: shortName,
        subLabel: p.activityLabel || p.state,
        contextOnly,
        state: p.state,
        isActive: p.state === 'active',
        x: 0, y: 0, width: NODE_WIDTH_AGENT, height: NODE_HEIGHT_AGENT,
        parent: tNode,
        children: [],
        sessionId: canNavigateSession(p.sessionId) ? p.sessionId : undefined,
        hexCode: getHex(p.agentId)
      };
      tNode.children.push(agentNode);
    });

    // Remove empty teams
    root.children = root.children.filter(t => t.children.length > 0);

    // Layout Algorithm (Bottom-Up sizing, Top-Down positioning)
    function layoutNode(node: OrgNode, startX: number, depth: number) {
      node.y = 80 + depth * LEVEL_SPACING_Y;
      
      if (node.children.length === 0) {
        node.x = startX;
        return startX + node.width + NODE_SPACING_X;
      } else {
        let currentX = startX;
        node.children.forEach(child => {
          currentX = layoutNode(child, currentX, depth + 1);
        });
        
        const firstChild = node.children[0];
        const lastChild = node.children[node.children.length - 1];
        // Center parent over children
        node.x = firstChild.x + (lastChild.x + lastChild.width - firstChild.x) / 2 - node.width / 2;
        
        return currentX;
      }
    }

    layoutNode(root, 0, 0);

    // Flatten and center
    const allNodes: OrgNode[] = [];
    const collect = (node: OrgNode) => {
      allNodes.push(node);
      node.children.forEach(collect);
    };
    collect(root);

    // Initial centering (only if pan hasn't been heavily modified)
    if (canvasRef.current) {
      const minX = Math.min(...allNodes.map(n => n.x));
      const maxX = Math.max(...allNodes.map(n => n.x + n.width));
      const treeWidth = maxX - minX;
      const canvasWidth = canvasRef.current.width;
      
      const offsetX = (canvasWidth - treeWidth) / 2 - minX;
      allNodes.forEach(n => n.x += offsetX);
      
      // Auto-pan slightly down on first load
      if (panRef.current.y === 0) {
        panRef.current.y = 40;
      }
    }

    nodesRef.current = allNodes;
  }, [presence, ceoDisplayName, profileByAgentId, isCeoOrchestrator, canNavigateSession]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays properly
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = Math.max(600, window.innerHeight * 0.6);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    let animationId: number;
    let time = 0;

    const drawOrthogonalLine = (x1: number, y1: number, x2: number, y2: number, isActive: boolean, t: number) => {
      const midY = y1 + (y2 - y1) / 2;
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, midY);
      ctx.lineTo(x2, midY);
      ctx.lineTo(x2, y2);
      
      if (isActive) {
        ctx.strokeStyle = 'rgba(57, 210, 192, 0.4)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      // Data packets flowing bottom to top (child to parent)
      if (isActive) {
        const totalDist = Math.abs(midY - y1) + Math.abs(x2 - x1) + Math.abs(y2 - midY);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#39d2c0';
        ctx.shadowBlur = 8;

        for (let i = 0; i < 3; i++) {
          const progress = ((t * 0.6) + (i / 3)) % 1; 
          let currentDist = progress * totalDist;
          let px, py;
          
          const d1 = Math.abs(y2 - midY); 
          const d2 = Math.abs(x1 - x2);   
          
          if (currentDist <= d1) {
            px = x2;
            py = y2 - currentDist; // Moving up from child
          } else if (currentDist <= d1 + d2) {
            currentDist -= d1;
            px = x2 + currentDist * Math.sign(x1 - x2); // Moving horizontally
            py = midY;
          } else {
            currentDist -= (d1 + d2);
            px = x1;
            py = midY - currentDist; // Moving up to parent
          }
          
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
    };

    const drawConnections = (node: OrgNode, t: number) => {
      node.children.forEach(child => {
        const x2 = child.x + child.width / 2;
        const y2 = child.y;
        const x1 = node.x + node.width / 2;
        const y1 = node.y + node.height;
        
        let isLinkActive = false;
        if (child.type === 'agent') {
          isLinkActive = !!child.isActive;
        } else if (child.type === 'team') {
          isLinkActive = child.children.some(c => c.isActive);
        }

        drawOrthogonalLine(x1, y1, x2, y2, isLinkActive, t);
        drawConnections(child, t);
      });
    };

    const drawNode = (node: OrgNode, isHovered: boolean, t: number) => {
      const { x, y, width, height, type, label, subLabel, isActive, state, hexCode, contextOnly } = node;
      const cut = type === 'root' ? 12 : 8;
      
      ctx.beginPath();
      ctx.moveTo(x + cut, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + height - cut);
      ctx.lineTo(x + width - cut, y + height);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x, y + cut);
      ctx.closePath();
      
      let fill = 'rgba(10, 12, 16, 0.85)';
      let stroke = 'rgba(255, 255, 255, 0.15)';
      
      if (type === 'root') {
        fill = 'rgba(15, 20, 25, 0.9)';
        stroke = 'rgba(255, 255, 255, 0.4)';
      } else if (isActive) {
        fill = 'rgba(57, 210, 192, 0.08)';
        stroke = '#39d2c0';
      } else if (state === 'waiting_input' || state === 'permission_needed') {
        fill = 'rgba(210, 153, 34, 0.08)';
        stroke = '#d29922';
      } else if (state === 'blocked') {
        fill = 'rgba(248, 81, 73, 0.08)';
        stroke = '#f85149';
      }

      if (isHovered && type === 'agent') {
        stroke = '#fff';
        fill = 'rgba(255, 255, 255, 0.15)';
      }

      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.fill();
      ctx.stroke();

      // Top-left accent corner
      ctx.beginPath();
      ctx.moveTo(x + cut, y);
      ctx.lineTo(x + cut + 6, y);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hex code badge
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`[${hexCode}]`, x + width - 6, y + 12);

      if (contextOnly) {
        const badgeText = 'CTX';
        ctx.font = 'bold 7px "JetBrains Mono", monospace';
        const badgeWidth = ctx.measureText(badgeText).width + 8;
        const badgeX = x + width - badgeWidth - 6;
        const badgeY = y + 15;
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeWidth, 10, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'left';
        ctx.fillText(badgeText, badgeX + 4, badgeY + 7);
      }

      // Status Indicator
      if (type === 'agent') {
        if (isActive) {
          ctx.fillStyle = '#39d2c0';
          // Animated Waveform
          const b1 = 2 + Math.sin(t * 5 + x) * 6;
          const b2 = 2 + Math.cos(t * 7 + y) * 6;
          const b3 = 2 + Math.sin(t * 6 + x) * 6;
          ctx.fillRect(x + width - 14, y + height/2 - b1/2 + 2, 2, b1);
          ctx.fillRect(x + width - 18, y + height/2 - b2/2 + 2, 2, b2);
          ctx.fillRect(x + width - 22, y + height/2 - b3/2 + 2, 2, b3);
        } else {
          // Static dot
          const sc = state ? STATE_COLOR[state] : '#6e7681';
          ctx.fillStyle = sc;
          ctx.fillRect(x + width - 16, y + height/2 - 2, 6, 6);
        }
      } else if (type === 'root') {
        // Spinning core
        ctx.save();
        ctx.translate(x + width - 30, y + height/2);
        ctx.rotate(t * 0.5);
        ctx.strokeStyle = '#39d2c0';
        ctx.lineWidth = 1;
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.rotate(t * -1.2);
        ctx.strokeRect(-7, -7, 14, 14);
        ctx.restore();
      }

      // Main Label
      ctx.fillStyle = (isActive || type === 'root') ? '#fff' : 'rgba(255,255,255,0.7)';
      ctx.font = type === 'root' ? 'bold 12px "JetBrains Mono", monospace' : 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label.toUpperCase(), x + 12, y + (subLabel ? 18 : height/2 + 4));

      // Sub Label
      if (subLabel) {
        let slColor = 'rgba(255,255,255,0.4)';
        if (isActive) slColor = '#39d2c0';
        else if (state === 'waiting_input') slColor = '#d29922';
        else if (state === 'permission_needed') slColor = '#f778ba';
        else if (state === 'blocked') slColor = '#f85149';
        
        ctx.fillStyle = slColor;
        ctx.font = '9px "JetBrains Mono", monospace';
        let trunc = subLabel.toUpperCase();
        if (trunc.length > 22) trunc = trunc.slice(0, 20) + '...';
        ctx.fillText(trunc, x + 12, y + 32);
      }
    };

    const render = () => {
      time += 0.016; // Approx 60fps
      
      const w = canvas.width;
      const h = canvas.height;

      // Deep space background
      const grad = ctx.createRadialGradient(w/2, h/2, 100, w/2, h/2, Math.max(w, h));
      grad.addColorStop(0, '#090b10');
      grad.addColorStop(1, '#020305');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(panRef.current.x, panRef.current.y);

      // Cyber Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gs = 40;
      const offsetX = panRef.current.x % gs;
      const offsetY = panRef.current.y % gs;
      
      ctx.beginPath();
      for (let x = -gs + offsetX; x < w - panRef.current.x; x += gs) {
        ctx.moveTo(x, -panRef.current.y); ctx.lineTo(x, h - panRef.current.y);
      }
      for (let y = -gs + offsetY; y < h - panRef.current.y; y += gs) {
        ctx.moveTo(-panRef.current.x, y); ctx.lineTo(w - panRef.current.x, y);
      }
      ctx.stroke();

      // Draw Connections
      const root = nodesRef.current.find(n => n.type === 'root');
      if (root) {
        drawConnections(root, time);
      }

      // Draw Nodes
      nodesRef.current.forEach(n => {
        drawNode(n, hoverRef.current === n.id, time);
      });

      ctx.restore();
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  // --- Interaction Handlers ---
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    if (isDraggingRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      panRef.current.x += dx;
      panRef.current.y += dy;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    const mx = e.clientX - rect.left - panRef.current.x;
    const my = e.clientY - rect.top - panRef.current.y;

    const hovered = nodesRef.current.find(n => 
      mx >= n.x && mx <= n.x + n.width && my >= n.y && my <= n.y + n.height
    );

    if (hovered?.id !== hoverRef.current) {
      hoverRef.current = hovered?.id || null;
      canvasRef.current.style.cursor =
        hovered && (hovered.type === 'agent' || (hovered.type === 'root' && !!hovered.sessionId))
          ? 'pointer'
          : 'grab';
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (!canvasRef.current) {
      return;
    }
    if (!hoverRef.current) {
      canvasRef.current.style.cursor = 'grab';
      return;
    }
    const hovered = nodesRef.current.find((node) => node.id === hoverRef.current);
    const clickable = !!(hovered && (hovered.type === 'agent' || hovered.type === 'root') && hovered.sessionId);
    canvasRef.current.style.cursor = clickable ? 'pointer' : 'grab';
  };

  const handleClick = () => {
    if (hoverRef.current && !isDraggingRef.current) {
      const node = nodesRef.current.find(n => n.id === hoverRef.current);
      if (node && (node.type === 'agent' || node.type === 'root') && node.sessionId) {
        onSelectSession(node.sessionId);
      }
    }
  };

  return (
    <div className="w-full flex flex-col font-mono" style={{ gap: '2px' }}>
      
      {/* Top Roster / Legend Bar */}
      <div className="flex flex-wrap gap-3 border border-[#30363d] bg-[#0d1117] p-2.5 items-center">
        <span className="text-[10px] font-bold text-[#8b949e] uppercase tracking-widest mr-2">SYS.ROSTER //</span>
        {presence.map((p) => {
          const isCeo = isCeoOrchestrator(p.agentId);
          const shortName = isCeo ? 'CEO' : p.agentId.split('-')[0];
          const isNavigable = canNavigateSession(p.sessionId);
          return (
            <div 
              key={p.id} 
              className={`flex items-center gap-2 rounded-sm px-2.5 py-1 transition-colors border ${
                isCeo
                  ? `border-[#39d2c080] ${isNavigable ? 'cursor-pointer bg-[#0e2a2f] hover:bg-[#12373e]' : 'cursor-not-allowed bg-[#0e2a2f]/70 opacity-70'}`
                  : `${isNavigable ? 'cursor-pointer bg-[#161b22] hover:bg-[#21262d]' : 'cursor-not-allowed bg-[#161b22] opacity-70'} border-[#30363d]`
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
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: STATE_COLOR[p.state] }} 
                title={p.state}
              />
              <span className="text-xs font-semibold text-[#c9d1d9]">
                {isCeo ? 'CEO' : shortName.toUpperCase()}
              </span>
              {!isNavigable ? (
                <span className="rounded-sm border border-amber-700/60 bg-amber-950/70 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-amber-300">
                  CTX
                </span>
              ) : null}
            </div>
          );
        })}
        {presence.length === 0 && (
          <span className="text-xs text-[#6e7681]">NO ACTIVE AGENTS</span>
        )}
      </div>

      {/* Canvas Container */}
      <div 
        ref={containerRef}
        className="w-full border border-[#30363d] bg-[#050505] overflow-hidden relative"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      >
        {/* Subtle decorative overlay */}
        <div className="absolute top-4 left-4 text-[10px] text-[#30363d] font-bold tracking-widest pointer-events-none select-none z-10">
          NETWORK TOPOLOGY<br/>
          DRAG TO PAN
        </div>
        
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ cursor: 'grab' }}
        />
      </div>

    </div>
  );
}
