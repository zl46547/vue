const path = require('path')

const resolve = p => path.resolve(__dirname, '../', p)

/**
 * 真实地址的映射
 * 列如：web 对应的真实的路径是 path.resolve(__dirname, '../src/platforms/web')，
 * 这个路径就找到了 Vue.js 源码的 web 目录。
 * 然后 resolve 函数通过 path.resolve(aliases[base], p.slice(base.length + 1)) 找到了最终路径，
 * 它就是 Vue.js 源码 web 目录下的 entry-runtime.js。
 * 因此，web-runtime-cjs 配置对应的入口文件就找到了。
 * 它经过 Rollup 的构建打包后，最终会在 dist 目录下生成 vue.runtime.common.js
 */
module.exports = {
  vue: resolve('src/platforms/web/entry-runtime-with-compiler'),
  compiler: resolve('src/compiler'),
  core: resolve('src/core'),
  shared: resolve('src/shared'),
  web: resolve('src/platforms/web'),
  weex: resolve('src/platforms/weex'),
  server: resolve('src/server'),
  sfc: resolve('src/sfc')
}
