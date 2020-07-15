/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

/*通过proxy函数将_data（或者_props等）上面的数据代理到vm上，这样就可以用app.text代替app._data.text了。*/
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  // 通过 Object.defineProperty 把 target[sourceKey][key] 的读写变成了对 target[key] 的读写。
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/*初始化props、methods、data、computed与watch*/
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  /*初始化props*/
  if (opts.props) initProps(vm, opts.props)
  /*初始化方法*/
  if (opts.methods) initMethods(vm, opts.methods)
  /*初始化data*/
  if (opts.data) {
    initData(vm)
  } else {
    /*该组件没有data的时候绑定一个空对象*/
    observe(vm._data = {}, true /* asRootData */)
  }
  // 初始化计算属性
  if (opts.computed) initComputed(vm, opts.computed)
  // 初始化watch
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

/**
 * 初始化props
 * @param vm
 * @param propsOptions
 */
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}

  /*缓存属性的key，使得将来能直接使用数组的索引值来更新props来替代动态地枚举对象*/
  const keys = vm.$options._propKeys = []

  /*根据$parent是否存在来判断当前是否是根结点*/
  const isRoot = !vm.$parent

  /*根结点会给shouldConvert赋true，根结点的props应该被转换*/
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    /*props的key值存入keys（_propKeys）中*/
    keys.push(key)

    /*验证prop,不存在用默认值替换，类型为bool则声称true或false，当使用default中的默认值的时候会将默认值的副本进行observe*/
    const value = validateProp(key, propsOptions, propsData, vm)

    /*判断是否是保留字段，如果是则发出warning*/
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      /*
          由于父组件重新渲染的时候会重写prop的值，所以应该直接使用prop来作为一个data或者计算属性的依赖
          https://cn.vuejs.org/v2/guide/components.html#字面量语法-vs-动态语法
        */
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // defineReactive 方法把每个 prop 对应的值变成响应式
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }

    /*Vue.extend()期间，静态prop已经在组件原型上代理了，我们只需要在这里进行代理prop*/
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

/**
 * 初始化data
 * @param vm
 */
function initData (vm: Component) {
  /*得到data数据*/
  let data = vm.$options.data

  // 判断是不是一个函数
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
    // 如果不是一个函数，就报警告
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }

  /*遍历data对象*/
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  //遍历data中的数据
  while (i--) {
    const key = keys[i]
    /*保证data中的key不与props中的key重复，props优先，如果有冲突会产生warning*/
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {/*判断是否是保留字段*/
      // 代理，使的可以通过this.[属性]访问data或methods，是的this.message = vm._data.message
      proxy(vm, `_data`, key)
    }
  }
  /*从这里开始我们要observe了，开始对数据进行绑定，这里有尤大大的注释asRootData，这步作为根数据，下面会进行递归observe进行对深层对象的绑定。*/
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

/**
 * 初始化computed
 * @param vm
 * @param computed
 */
function initComputed (vm: Component, computed: Object) {
  // 创建一个空对象
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()
  // 对 computed 对象做遍历，拿到计算属性的每一个 userDef
  for (const key in computed) {
    // 获取用户定义的方法
    const userDef = computed[key]
    /*
      然后尝试获取这个 userDef 对应的 getter 函数，拿不到则在开发环境下报警告
      计算属性可能是一个function，也有可能设置了get以及set的对象。
    */
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // 创建一个watcher，将用户定义的方法作为参数传入，标识这个watcher是一个lazy
      // 这个 watcher 和渲染 watcher 有一点很大的不同，它是一个 computed watcher，
      // 因为 const computedWatcherOptions = { computed: true }。
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // 最后对判断如果 key 不是 vm 的属性，则调用 defineComputed(vm, key, userDef)，
    // 否则判断计算属性对于的 key 是否已经被 data 或者 prop 所占用，如果是的话则在开发环境报相应的警告。
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

/**
 * 定义计算属性
 * @param target
 * @param key
 * @param userDef
 */
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()

  /*
      当userDef是一个function的时候是不需要setter的，所以这边给它设置成了空函数。
      因为计算属性默认是一个function，只设置getter。
      当需要设置setter的时候，会将计算属性设置成一个对象。
    */
  if (typeof userDef === 'function') {
    /*创建计算属性的getter*/
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key) // 创建计算属性的getter
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    /*get不存在则直接给空函数，如果存在则查看是否有缓存cache，没有依旧赋值get，有的话使用createComputedGetter创建*/
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    /*如果有设置set方法则直接使用，否则赋值空函数*/
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 代理
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/**
 * 创建计算属性的getter
 * @param key
 * @returns {computedGetter}
 */
function createComputedGetter (key) {
  // 取值的时候调用此方法
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // 实际是脏检查，在计算属性中的依赖发生改变的时候dirty会变成true，在get的时候重新计算计算属性的输出值
      if (watcher.dirty) {
        watcher.evaluate()
      }
      /*依赖收集*/
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

/**
 * 初始化方法
 * @param vm
 * @param methods
 */
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      /*与props名称冲突报出warning*/
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    /*在为null的时候写上空方法，有值时候将上下文替换成vm*/
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

/**
 * 初始化watchers
 * @param vm
 * @param watch
 */
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    /*数组则遍历进行createWatcher*/
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

/**
 * 创建一个观察者Watcher
 * @param vm
 * @param expOrFn
 * @param handler
 * @param options
 */
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  /*对对象类型进行严格检查，只有当对象是纯javascript对象的时候返回true*/
  /*
      这里是当watch的写法是这样的时候
      watch: {
          test: {
              handler: function () {},
              deep: true
          }
      }
    */
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    /* 当然，也可以直接使用vm中methods的方法 */
    handler = vm[handler]
  }
  /*用$watch方法创建一个watch来观察该对象的变化*/
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  /*
    用以将data之外的对象绑定成响应式的
  */
  Vue.prototype.$set = set

  /*
    与set对立，解除绑定
  */
  Vue.prototype.$delete = del

  /*
    $watch方法
    用以为对象建立观察者监视变化
  */
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    // 创建一个watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)
    /*有immediate参数的时候会立即执行*/
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    /*返回一个取消观察函数，用来停止触发回调*/
    return function unwatchFn () {
      /*将自身从所有依赖收集订阅列表删除*/
      watcher.teardown()
    }
  }
}
