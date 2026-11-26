'use client';

import { supabase } from '@/lib/supabase';

export type ProctoringBroadcastHandler = (envelope: any) => void;

const listenerMap = new Map<string, Set<ProctoringBroadcastHandler>>();
const pendingOnSubscribed = new Set<() => void>();

let sharedChannel: any = null;
let isChannelSubscribed = false;
let activeSubscribers = 0;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

function dispatchBroadcast(event: string, envelope: any) {
  const handlers = listenerMap.get(event);
  if (!handlers || handlers.size === 0) return;
  handlers.forEach((handler) => {
    try {
      handler(envelope);
    } catch (err) {
      console.error(`[proctoringRoom] listener error for "${event}":`, err);
    }
  });
}

function flushSubscribedCallbacks() {
  const callbacks = Array.from(pendingOnSubscribed);
  pendingOnSubscribed.clear();
  callbacks.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error('[proctoringRoom] onSubscribed error:', err);
    }
  });
}

function bindAndSubscribeChannel(chan: any) {
  if (!(chan as any).__eduestWildcardBound) {
    (chan as any).__eduestWildcardBound = true;
    chan.on('broadcast', { event: '*' }, (envelope: any) => {
      const evt = envelope?.event;
      if (evt) dispatchBroadcast(evt, envelope);
    });
  }

  if (chan.state === 'joined') {
    isChannelSubscribed = true;
    flushSubscribedCallbacks();
    return;
  }

  if (chan.state === 'closed' || chan.state === 'errored') {
    chan.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        isChannelSubscribed = true;
        flushSubscribedCallbacks();
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        isChannelSubscribed = false;
      }
    });
  } else if (chan.state === 'leaving') {
    setTimeout(() => {
      if (activeSubscribers > 0) {
        const fresh = supabase.channel('proctoring_room');
        sharedChannel = fresh;
        bindAndSubscribeChannel(fresh);
      }
    }, 250);
  }
}

export function getProctoringChannel() {
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }

  if (sharedChannel) {
    if (sharedChannel.state === 'closed' || sharedChannel.state === 'errored') {
      bindAndSubscribeChannel(sharedChannel);
    }
    return sharedChannel;
  }

  const chan = supabase.channel('proctoring_room');
  sharedChannel = chan;
  bindAndSubscribeChannel(chan);
  return chan;
}

/**
 * Subscribe multiple React components in the same browser tab to the shared
 * `'proctoring_room'` broadcast channel safely, without one component's
 * cleanup tearing down another component's WebSocket subscription.
 */
export function subscribeProctoringRoom(
  handlers: Record<string, ProctoringBroadcastHandler>,
  onSubscribed?: () => void
): () => void {
  activeSubscribers += 1;

  const entries = Object.entries(handlers);
  entries.forEach(([event, handler]) => {
    let set = listenerMap.get(event);
    if (!set) {
      set = new Set();
      listenerMap.set(event, set);
    }
    set.add(handler);
  });

  if (onSubscribed) {
    if (isChannelSubscribed && sharedChannel?.state === 'joined') {
      queueMicrotask(() => {
        try {
          onSubscribed();
        } catch (err) {
          console.error('[proctoringRoom] onSubscribed error:', err);
        }
      });
    } else {
      pendingOnSubscribed.add(onSubscribed);
    }
  }

  getProctoringChannel();

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;

    entries.forEach(([event, handler]) => {
      const set = listenerMap.get(event);
      if (set) {
        set.delete(handler);
        if (set.size === 0) listenerMap.delete(event);
      }
    });

    if (onSubscribed) {
      pendingOnSubscribed.delete(onSubscribed);
    }

    activeSubscribers = Math.max(0, activeSubscribers - 1);
    if (activeSubscribers === 0) {
      if (teardownTimer) clearTimeout(teardownTimer);
      teardownTimer = setTimeout(() => {
        teardownTimer = null;
        if (activeSubscribers === 0 && sharedChannel) {
          const toRemove = sharedChannel;
          sharedChannel = null;
          isChannelSubscribed = false;
          supabase.removeChannel(toRemove).catch(() => {});
        }
      }, 1500);
    }
  };
}

export function sendProctoringBroadcast(event: string, payload: any) {
  const chan = getProctoringChannel();
  if (!chan) return Promise.resolve('error');
  return chan.send({
    type: 'broadcast',
    event,
    payload,
  });
}
