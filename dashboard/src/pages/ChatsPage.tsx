import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ArrowsClockwise,
  ChatCircleText,
  Clock,
  Fingerprint,
  MagnifyingGlass,
  Robot,
  TelegramLogo,
  WarningCircle,
  Hash,
  Broadcast,
  ShieldCheck,
  Eye,
  EyeSlash,
  Stack,
  TerminalWindow,
  Waveform,
  Ghost
} from '@phosphor-icons/react';
import type { Variants } from 'framer-motion';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { useEffect, useMemo, useState, memo } from 'react';

import { resolveConversationInteractionMode, resolveInteractionModeCopy } from '../app/interactionMode';
import { chatsQueryOptions } from '../app/queryOptions';
import type { SessionRow, MessageRow } from '../app/types';
import { useAppStore } from '../app/store';

type Chat = { session: SessionRow; messages: MessageRow[] };

/* ── Animation Variants ────────────────────────────────────────────── */
const itemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } }
};

const viewportVariants: Variants = {
  hidden: { opacity: 0, scale: 0.99, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 30 } }
};

/* ── Helper Components ─────────────────────────────────────────────── */

const ChannelTag = memo(({ channel }: { channel: string }) => {
  const isTelegram = channel.toLowerCase().includes('telegram');
  const isApi = channel.toLowerCase().includes('api');
  
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider ${
      isTelegram ? 'bg-white/[0.04] border-white/10 text-[var(--shell-text)]' :
      isApi ? 'bg-[color:var(--shell-accent-soft)] border-[color:var(--shell-accent-border)] text-[var(--shell-accent)]' :
      'bg-slate-800/40 border-slate-700/50 text-slate-500'
    }`}>
      {isTelegram ? <TelegramLogo size={10} weight="fill" /> : 
       isApi ? <Fingerprint size={10} weight="bold" /> : 
       <Broadcast size={10} weight="bold" />}
      {channel}
    </div>
  );
});
ChannelTag.displayName = 'ChannelTag';

export function ChatsPage() {
  const token = useAppStore((state) => state.token);
  const chatsQuery = useQuery(chatsQueryOptions(token));
  const chats = chatsQuery.data ?? [];
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInternal, setShowInternal] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => (a.session.lastActivityAt < b.session.lastActivityAt ? 1 : -1)),
    [chats]
  );

  const visibleChats = useMemo(
    () =>
      sortedChats.filter((chat) => {
        if (!showInternal && isInternalSession(chat)) {
          return false;
        }
        if (!showEmpty && chat.messages.length === 0) {
          return false;
        }
        return true;
      }),
    [showEmpty, showInternal, sortedChats]
  );

  const filteredChats = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return visibleChats;
    return visibleChats.filter(c => 
      c.session.sessionKey.toLowerCase().includes(q) || 
      c.session.channel.toLowerCase().includes(q)
    );
  }, [visibleChats, searchQuery]);

  const selectedChat = useMemo(
    () => filteredChats.find(c => c.session.id === selectedChatId) || null,
    [filteredChats, selectedChatId]
  );
  const selectedChatMode = useMemo(
    () => resolveConversationInteractionMode(selectedChat?.messages ?? [], null),
    [selectedChat]
  );
  const selectedChatModeCopy = resolveInteractionModeCopy(selectedChatMode.mode);

  useEffect(() => {
    if (filteredChats.length === 0) {
      if (selectedChatId !== null) {
        setSelectedChatId(null);
      }
      return;
    }

    const hasSelection = selectedChatId !== null && filteredChats.some((chat) => chat.session.id === selectedChatId);
    if (!hasSelection) {
      setSelectedChatId(filteredChats[0]?.session.id ?? null);
    }
  }, [filteredChats, selectedChatId]);

  return (
    <LazyMotion features={domAnimation}>
    <div className="min-h-[100dvh] max-w-[1400px] mx-auto pt-8 px-4 md:px-8 pb-20 relative flex flex-col">
      
      {/* NOISE OVERLAY */}
      <div className="fixed inset-0 z-50 pointer-events-none opacity-[0.03] mix-blend-overlay">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noise)" />
        </svg>
      </div>

      {/* HEADER SECTION */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12 relative z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] p-1.5">
              <Waveform size={18} className="text-[var(--shell-accent)]" weight="bold" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--shell-accent)]">Intelligence Streams</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-medium tracking-tighter text-slate-100 flex items-baseline gap-3">
            Inbound <span className="text-slate-600 italic font-light">Traffic</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center p-1 rounded-2xl bg-slate-900/30 border border-slate-800/60">
             <button 
               onClick={() => setShowInternal(!showInternal)}
               className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                 showInternal ? 'bg-[color:var(--shell-accent)] text-[var(--shell-bg)]' : 'text-slate-500 hover:text-slate-300'
               }`}
             >
               {showInternal ? <Eye size={14} weight="bold" /> : <EyeSlash size={14} weight="bold" />} Internal
             </button>
             <button 
               onClick={() => setShowEmpty(!showEmpty)}
               className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                 showEmpty ? 'bg-[color:var(--shell-accent)] text-[var(--shell-bg)]' : 'text-slate-500 hover:text-slate-300'
               }`}
             >
               {showEmpty ? <Stack size={14} weight="bold" /> : <Stack size={14} weight="regular" />} Empty
             </button>
          </div>

          <div className="relative group min-w-[280px]">
            <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-[var(--shell-accent)]" size={18} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Scan conversation keys..."
              className="shell-field w-full rounded-2xl py-3.5 pl-12 pr-4 text-sm font-mono"
            />
          </div>
          
          <button
            onClick={() => void chatsQuery.refetch()}
            className="shell-button-ghost rounded-2xl p-3.5 text-slate-400 transition-all active:scale-[0.95] hover:text-[var(--shell-accent)]"
          >
            <ArrowsClockwise size={22} weight="bold" className={chatsQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* CHAT INTERFACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0 overflow-hidden relative z-10">

        {/* LEFT: STREAM LIST */}
        <aside className="lg:col-span-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 mb-6 shrink-0">
             <div className="flex items-center gap-2">
               <div className="h-1.5 w-1.5 rounded-full bg-[color:var(--shell-accent)] animate-pulse" />
               <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Active Channels</h2>
             </div>
             <span className="text-[9px] font-mono text-slate-600 font-bold uppercase tracking-tighter">
               {filteredChats.length} / {sortedChats.length} Units
             </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-3 space-y-3 scrollbar-hide">
            <AnimatePresence mode="popLayout">
              {filteredChats.map((chat) => (
                <ChatListItem 
                  key={chat.session.id} 
                  chat={chat} 
                  isSelected={selectedChatId === chat.session.id}
                  onClick={() => setSelectedChatId(chat.session.id)}
                />
              ))}
              {filteredChats.length === 0 && (
                <m.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="py-24 text-center border border-dashed border-slate-800/50 rounded-[2.5rem] bg-slate-900/10"
                >
                  <div className="w-16 h-16 rounded-full bg-slate-900/50 flex items-center justify-center mx-auto mb-6 border border-slate-800">
                    <Ghost size={32} className="text-slate-700" weight="thin" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Zero Traffic Detected</p>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </aside>

        {/* RIGHT: SECURE VIEWPORT */}
        <main className="lg:col-span-8 flex flex-col bg-slate-900/20 border border-slate-800/40 rounded-[3rem] overflow-hidden relative shadow-[0_30px_100px_-20px_rgba(0,0,0,0.3)] min-h-[500px] max-h-[calc(100dvh-12rem)]">
          {/* ACCENT BLUR */}
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 bg-[color:var(--shell-accent-soft)] blur-[120px]" />
          
          <AnimatePresence mode="wait">
            {selectedChat ? (
              <m.div 
                key={selectedChat.session.id}
                variants={viewportVariants}
                initial="hidden" animate="show" exit="hidden"
                className="flex flex-col h-full relative z-10"
              >
                {/* Viewport Header */}
                <header className="p-8 border-b border-slate-800/40 flex items-center justify-between bg-slate-950/40 backdrop-blur-xl">
                   <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-3">
                         <ChannelTag channel={selectedChat.session.channel} />
                         {selectedChatModeCopy ? (
                           <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${selectedChatModeCopy.chipClassName}`}>
                             {selectedChatModeCopy.shortLabel}
                           </span>
                         ) : null}
                         <div className="h-4 w-px bg-slate-800" />
                         <span className="text-[9px] text-slate-500 font-mono tracking-tighter uppercase font-bold select-text">SID :: {selectedChat.session.id.slice(0, 12)}</span>
                      </div>
                      <h2 className="text-2xl font-medium text-slate-100 break-all leading-tight tracking-tighter font-display uppercase select-text">
                        {selectedChat.session.sessionKey}
                      </h2>
                   </div>
                   <div className="hidden sm:flex items-center gap-6 pl-8 border-l border-slate-800/60 shrink-0">
                      <div className="text-right space-y-1">
                         <p className="text-[9px] uppercase tracking-[0.2em] font-black text-slate-600">Primary Agent</p>
                         <div className="flex items-center justify-end gap-2">
                           <span className="text-xs text-slate-200 font-mono select-text">{selectedChat.session.agentId}</span>
                           <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]">
                             <Robot size={18} weight="duotone" />
                           </div>
                         </div>
                      </div>
                   </div>
                </header>

                {/* Packet Feed */}
                <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-10 scrollbar-hide">
                   {selectedChat.messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-700">
                         <WarningCircle size={64} weight="thin" className="mb-6 opacity-20" />
                         <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40">Standby :: Awaiting Packet Ingress</p>
                      </div>
                   ) : (
                      <div className="space-y-1">
                        {selectedChat.messages.map((msg, idx) => (
                          <MessagePacket key={msg.id} message={msg} isLast={idx === selectedChat.messages.length - 1} />
                        ))}
                      </div>
                   )}
                </div>

                {/* Viewport Status Footer */}
                <footer className="p-6 px-8 border-t border-slate-800/40 bg-slate-950/60 flex items-center justify-between shrink-0">
                   <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-600" />
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-tighter">Sync: {new Date(selectedChat.session.lastActivityAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Hash size={14} className="text-slate-600" />
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-tighter">Payloads: {selectedChat.messages.length} Units</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-2 rounded-full border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--shell-accent)]">
                      <ShieldCheck size={14} weight="fill" /> Secure Telemetry Active
                   </div>
                </footer>
              </m.div>
            ) : (
              <m.div 
                key="empty-state"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center p-20 text-center"
              >
                 <div className="w-24 h-24 rounded-[2rem] bg-slate-900/50 border border-slate-800 flex items-center justify-center mb-8 relative shadow-inner">
                    <ChatCircleText size={48} className="text-slate-700" weight="thin" />
                    <m.div 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="absolute inset-0 rounded-[2rem] border-2 border-[color:var(--shell-accent-border)]"
                    />
                 </div>
                 <h3 className="text-2xl font-medium text-slate-300 tracking-tight uppercase">Intelligence Terminal</h3>
                 <p className="text-xs text-slate-600 mt-4 max-w-[35ch] leading-relaxed font-mono uppercase tracking-tight">
                   Select an operational stream to inspect live traffic and system responses.
                 </p>
              </m.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
    </LazyMotion>
  );
}

function ChatListItem({ chat, isSelected, onClick }: { chat: Chat, isSelected: boolean, onClick: () => void }) {
  const lastMsg = chat.messages[chat.messages.length - 1];
  const lastModeCopy = resolveInteractionModeCopy(lastMsg?.interactionMode ?? null);
  
  return (
    <m.button
      variants={itemVariants}
      layout
      onClick={onClick}
      className={`w-full p-6 rounded-[2rem] border text-left transition-all duration-500 group relative overflow-hidden ${
        isSelected 
          ? 'bg-[color:var(--shell-accent-soft)] border-[color:var(--shell-accent-border)] shadow-[0_15px_40px_-10px_rgba(0,0,0,0.18)]' 
          : 'bg-slate-900/20 border-slate-800/40 hover:bg-slate-900/40 hover:border-slate-700/60'
      }`}
    >
      {/* SELECTION INDICATOR */}
      {isSelected && (
        <m.div 
          layoutId="selection-border"
          className="absolute left-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-r-full bg-[color:var(--shell-accent)]"
        />
      )}

      <div className="flex items-center justify-between mb-4">
         <ChannelTag channel={chat.session.channel} />
         <span className="text-[10px] font-mono text-slate-600 font-black uppercase tracking-tighter">
            {new Date(chat.session.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
         </span>
      </div>
      
      <h4 className={`text-base font-medium truncate tracking-tight uppercase font-display select-text ${isSelected ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-200'}`}>
        {chat.session.sessionKey}
      </h4>
      
      <div className="mt-3 flex items-center gap-2">
         <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
         <p className="text-[11px] text-slate-500 line-clamp-1 italic font-mono opacity-80">
           {lastMsg ? lastMsg.content : 'Awaiting initialization...'}
         </p>
      </div>
      {lastModeCopy ? (
        <div className="mt-4 flex items-center justify-end">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${lastModeCopy.chipClassName}`}>
            {lastModeCopy.shortLabel}
          </span>
        </div>
      ) : null}
    </m.button>
  );
}

function MessagePacket({ message, isLast }: { message: MessageRow; isLast: boolean }) {
  const isInbound = message.direction === 'inbound';
  const interactionCopy = !isInbound ? resolveInteractionModeCopy(message.interactionMode ?? null) : null;
  
  return (
    <m.div 
      initial={{ opacity: 0, x: isInbound ? -10 : 10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`group relative py-6 flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
    >
      {/* TIMELINE THREAD */}
      {!isLast && (
        <div className={`absolute bottom-0 w-px bg-slate-800/60 top-12 ${isInbound ? 'left-6' : 'right-6'}`} />
      )}

      <div className={`flex flex-col max-w-[90%] md:max-w-[80%] ${isInbound ? 'items-start' : 'items-end'}`}>
        
        {/* PACKET HEADER */}
        <div className={`flex items-center gap-3 mb-3 px-1 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}>
           <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
             isInbound ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-[color:var(--shell-accent-soft)] border-[color:var(--shell-accent-border)] text-[var(--shell-accent)]'
           }`}>
             {isInbound ? <Fingerprint size={16} /> : <TerminalWindow size={16} weight="bold" />}
           </div>
           <div className={isInbound ? 'text-left' : 'text-right'}>
              <span className="text-[9px] uppercase tracking-[0.2em] font-black text-slate-500 block mb-0.5">
                {message.sender || (isInbound ? 'Remote Node' : 'Command Center')}
              </span>
              <div className={`flex items-center gap-2 ${isInbound ? 'justify-start' : 'justify-end'}`}>
                <span className="text-[8px] font-mono text-slate-700 font-bold uppercase tracking-tighter">
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} :: {message.source}
                </span>
                {interactionCopy ? (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] ${interactionCopy.chipClassName}`}>
                    {interactionCopy.shortLabel}
                  </span>
                ) : null}
              </div>
           </div>
        </div>

        {/* PACKET CONTENT */}
        <div className={`relative p-5 rounded-[2rem] border transition-all duration-500 ${
          isInbound 
            ? 'bg-slate-900/40 border-slate-800/80 text-slate-300 rounded-tl-none' 
            : 'bg-[color:var(--shell-accent-soft)] border-[color:var(--shell-accent-border)] text-slate-100 rounded-tr-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.12)]'
        }`}>
          {/* DIRECTIONAL INDICATOR */}
          <div className={`absolute top-0 w-3 h-3 border-t border-inherit ${
            isInbound ? '-left-px -translate-x-full border-l rounded-tl-xl' : '-right-px translate-x-full border-r rounded-tr-xl'
          }`} />

          <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap font-sans tracking-wide select-text">
            {message.content}
            {isInbound && <m.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }} className="ml-1 inline-block h-3 w-1.5 bg-[color:var(--shell-accent)] opacity-40 align-middle" />}
          </p>
          
          <div className={`mt-4 flex items-center gap-2 text-[8px] font-black uppercase tracking-widest opacity-30 ${isInbound ? 'justify-start' : 'justify-end'}`}>
             <ArrowUpRight size={10} className={isInbound ? 'rotate-180' : ''} /> Packet Signature Verified
          </div>
        </div>
      </div>
    </m.div>
  );
}

function isInternalSession(chat: Chat): boolean {
  const channel = chat.session.channel.toLowerCase();
  const chatType = (chat.session.chatType ?? '').toLowerCase();
  const sessionKey = chat.session.sessionKey.toLowerCase();
  const source = String(chat.session.metadata?.source ?? '').toLowerCase();

  if (channel === 'internal' || chatType === 'internal') {
    return true;
  }

  if (source === 'dashboard' || source === 'agent' || source === 'system') {
    return true;
  }

  return (
    sessionKey.startsWith('dashboard:internal:') ||
    sessionKey.startsWith('agent:') ||
    sessionKey.startsWith('office:')
  );
}
