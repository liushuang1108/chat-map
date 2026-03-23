/// <reference types="@dcloudio/types" />

/** 微信小程序全局（云开发等） */
declare const wx: Record<string, unknown>

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, unknown>
  export default component
}
