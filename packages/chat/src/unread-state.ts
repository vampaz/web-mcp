export type LauncherUnreadState = 'initial' | 'read' | 'unread'
export type LauncherUnreadEvent = 'baseline' | 'arrived' | 'opened' | 'reset'

/** Tracks whether a reply arrived while the popup was closed. */
export function transitionLauncherUnread(
  state: LauncherUnreadState,
  event: LauncherUnreadEvent
): LauncherUnreadState {
  switch (event) {
    case 'baseline':
      return state === 'initial' ? 'read' : state
    case 'arrived':
      return state === 'read' ? 'unread' : state
    case 'opened':
      return state === 'unread' ? 'read' : state
    case 'reset':
      return 'initial'
  }
}
