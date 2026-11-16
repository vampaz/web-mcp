import { expect, it } from 'vitest'
import { transitionLauncherUnread } from './unread-state'

it('baselines the first snapshot and tracks closed replies until opened', function transitions() {
  expect(transitionLauncherUnread('initial', 'arrived')).toBe('initial')
  expect(transitionLauncherUnread('initial', 'baseline')).toBe('read')
  expect(transitionLauncherUnread('read', 'arrived')).toBe('unread')
  expect(transitionLauncherUnread('unread', 'arrived')).toBe('unread')
  expect(transitionLauncherUnread('unread', 'opened')).toBe('read')
  expect(transitionLauncherUnread('read', 'opened')).toBe('read')
  expect(transitionLauncherUnread('unread', 'baseline')).toBe('unread')
  expect(transitionLauncherUnread('unread', 'reset')).toBe('initial')
})
