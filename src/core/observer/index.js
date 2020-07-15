/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/*
  每个被观察到对象被附加上观察者实例，一旦被添加，观察者将为目标对象加上getter\setter属性，进行依赖收集以及调度更新。
*/
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    /*
      通过执行 def 函数把自身实例添加到数据对象 value 的 __ob__ 属性上,这就是为什么我在开发中输出 data 上对象类型的数据，会发现该对象多了一个 __ob__ 的属性
      将Observer实例绑定到data的__ob__属性上面去，之前说过observe的时候会先检测是否已经有__ob__对象存放Observer实例了
    */
    def(value, '__ob__', this)
    // 如果是数组，将修改后可以截获响应的数组方法替换掉该数组的原型中的原生方法，达到监听数组数据变化响应的效果。
    if (Array.isArray(value)) {
      // 这里如果当前浏览器支持__proto__属性，则直接覆盖当前数组对象原型上的原生数组方法，如果不支持该属性，则直接覆盖数组对象的原型。
      // hasProto 实际上就是判断对象中是否存在 __proto__，如果存在则 augment 指向 protoAugment， 否则指向 copyAugment，
      if (hasProto) {
        // 修改数据的原型方法
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 深度观察数组中的每一项
      this.observeArray(value)
    } else {
      /*如果是对象则直接walk进行绑定*/
      this.walk(value)
    }
  }

  /*
      遍历每一个对象并且在它们上面绑定getter与setter。这个方法只有在value的类型是对象的时候才能被调用
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * 循环每一项，继续观测
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

/*直接覆盖原型的方法来修改目标对象或数组*/
// 对于大部分现代浏览器都会走到 protoAugment，那么它实际上就把 value 的原型指向了 arrayMethods
// arrayMethods 的定义在 src/core/observer/array.js 中：
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/*定义（覆盖）目标对象或数组的某一个方法*/
// copyAugment 方法是遍历 keys，通过 def，也就是 Object.defineProperty 去定义它自身的属性值。
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * 尝试创建一个Observer实例（__ob__），如果成功创建Observer实例则返回新的Observer实例，如果已有Observer实例则返回现有的Observer实例。
 * @param value
 * @param asRootData
 * @returns {Observer|void}
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 如果不是对象，就return
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 如果已经监听过了，就不会重复监听
  /*这里用__ob__这个属性来判断是否已经有Observer实例，如果没有Observer实例则会新建一个Observer实例并赋值给__ob__这个属性，如果已有Observer实例则直接返回该Observer实例*/
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (// 如果没有被观测，会去创建一个Observer实例
    /*
       这里的判断是为了确保value是单纯的对象，而不是函数或者是Regexp等情况。
       而且该对象在shouldObserve的时候才会进行Observer。这是一个标识位，避免重复对value进行Observer
    */
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    /*如果是根数据则计数，后面Observer中的observe的asRootData非true*/
    ob.vmCount++
  }
  return ob
}

/**
 * 为对象defineProperty上在变化时通知的属性
 * @param obj
 * @param key
 * @param val
 * @param customSetter
 * @param shallow
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  /*在闭包中定义一个dep对象*/
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  /*如果之前该对象已经预设了getter以及setter函数则将其取出来，新定义的getter/setter中会将其执行，保证不会覆盖之前已经定义的getter/setter。*/
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  /*对象的子对象递归进行observe并返回子节点的Observer对象*/
  // getter 做的事情是依赖收集，setter 做的事情是派发更新
  let childOb = !shallow && observe(val) // 递归观测
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () { // 数据的取值
      /*如果原本对象拥有getter方法则执行*/
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend() // 收集依赖 watcher
        if (childOb) {
          /*子对象进行依赖收集，其实就是将同一个watcher观察者实例放进了两个depend中，一个是正在本身闭包中的depend，另一个是子元素的depend*/
          childOb.dep.depend() // 收集依赖
          if (Array.isArray(value)) {
            /*是数组则需要对每一个成员都进行依赖收集，如果数组的成员还是数组，则递归。*/
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) { // 数据的设置值
      /*通过getter方法获取当前值，与新值进行比较，一致则不需要执行下面的操作*/
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        /*如果原本对象拥有setter方法则执行setter*/
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      /*新的值需要重新进行observe，保证数据响应式*/
      childOb = !shallow && observe(newVal)
      /*dep对象通知所有的观察者*/
      dep.notify() // 触发数据对应的依赖进行更新
    }
  })
}

/**
 * 在对象上设置属性。添加新属性，并在属性不存在时触发更改通知。
 * @params target 可能是数组或者是普通对象
 * @params key 代表的是数组的下标或者是对象的键值
 * @params key 代表添加的值
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 如果target未定义或者target是基础类型
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  /*如果传入数组并且key 是一个合法的下标，则通过 splice 去添加进数组然后返回*/
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    /*因为数组不需要进行响应式处理，数组会修改七个Array原型上的方法来进行响应式处理*/
    return val
  }
  /*判断 key 是否已经存在于 target 中，则直接返回*/
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  /*获得target的Oberver实例
  * ，然后再，还记得我们在给对象添加 getter 的时候有这么一段逻辑：
  */
  const ob = (target: any).__ob__
  /*
    _isVue 一个防止vm实例自身被观察的标志位 ，_isVue为true则代表vm实例，也就是this
    vmCount判断是否为根节点，存在则代表是data的根节点，Vue 不允许在已经创建的实例上动态添加新的根级响应式属性(root-level reactive property)
  */
  if (target._isVue || (ob && ob.vmCount)) {
    /*
      Vue 不允许在已经创建的实例上动态添加新的根级响应式属性(root-level reactive property)。
      https://cn.vuejs.org/v2/guide/reactivity.html#变化检测问题
    */
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 如果ob不存在，则说明 target 不是一个响应式的对象，则直接赋值并返回。
  if (!ob) {
    target[key] = val
    return val
  }
  // 通过 defineReactive(ob.value, key, val) 把新添加的属性变成响应式对象
  defineReactive(ob.value, key, val)
  // 通过 ob.dep.notify() 手动的触发依赖通知
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    /*通过对象上的观察者进行依赖收集*/
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      /*当数组成员还是数组的时候地柜执行该方法继续深层依赖收集，直到是对象为止。*/
      dependArray(e)
    }
  }
}
