/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */
import { def } from '../util/index'

const arrayProto = Array.prototype
// 继承了 Array
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice,
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 对数组中所有能改变数组自身的方法，如 push、pop 等这些方法进行重写，重写后的方法会先执行它们本身原有的逻辑，
 * 并对能增加数组长度的 3 个方法 push、unshift、splice 方法做了判断，获取到插入的值，
 * 然后把新添加的值变成一个响应式对象，并且再调用 ob.dep.notify() 手动触发依赖通知
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 对新增的数据也进行观测
    if (inserted) ob.observeArray(inserted)
    // 通知视图更新
    ob.dep.notify()
    return result
  })
})
