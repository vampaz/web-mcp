import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'

export function mountWithDeps(
  component: Component,
  options: ComponentMountingOptions<Component> = {}
): VueWrapper {
  return mount(component, options)
}
