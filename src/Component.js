import * as _ from './util'
import {
	renderComponent,
	clearPending,
	compareTwoVnodes,
	getChildContext,
	syncCache
} from './virtual-dom'

export let updateQueue = {
	updaters: [],
	isPending: false,
	add(updater) {
		_.addItem(this.updaters, updater)
	},
	batchUpdate() {
		if (this.isPending) {
			return
		}
		this.isPending = true
		/*
		 each updater.update may add new updater to updateQueue
		 clear them with a loop
		 event bubbles from bottom-level to top-level
		 reverse the updater order can merge some props and state and reduce the refresh times
		 see Updater.update method below to know why
		*/
		let { updaters } = this
		let updater
		while (updater = updaters.pop()) {
			updater.updateComponent()
		}
		this.isPending = false
	}
}

function Updater(instance) {
	this.instance = instance
	this.pendingStates = []
	this.pendingCallbacks = []
	this.isPending = false
	this.nextProps = this.nextContext = null
	this.clearCallbacks = this.clearCallbacks.bind(this)
}

Updater.prototype = {
	emitUpdate(nextProps, nextContext) {
		this.nextProps = nextProps
		this.nextContext = nextContext
		// receive nextProps!! should update immediately
		nextProps || !updateQueue.isPending
		? this.updateComponent()
		: updateQueue.add(this)
	},
	updateComponent() {
		let { instance, pendingStates, nextProps, nextContext } = this
		if (nextProps || pendingStates.length > 0) {
			nextProps = nextProps || instance.props
			nextContext = nextContext || instance.context
			this.nextProps = this.nextContext = null
			// merge the nextProps and nextState and update by one time
			shouldUpdate(instance, nextProps, this.getState(), nextContext, this.clearCallbacks)
		}
	},
	addState(nextState) {
		if (nextState) {
			_.addItem(this.pendingStates, nextState)
			if (!this.isPending) {
				this.emitUpdate()
			}
		}
	},
	replaceState(nextState) {
		let { pendingStates } = this
		pendingStates.pop()
		// push special params to point out should replace state
		_.addItem(pendingStates, [nextState])
	},
	getState() {
		let { instance, pendingStates } = this
		let { state, props } = instance
		if (pendingStates.length) {
			state = _.extend({}, state)
			pendingStates.forEach(nextState => {
				let isReplace = _.isArr(nextState)
				if (isReplace) {
					nextState = nextState[0]
				}
				if (_.isFn(nextState)) {
					nextState = nextState.call(instance, state, props)
				}
				// replace state
				if (isReplace) {
					state = _.extend({}, nextState)
				} else {
					_.extend(state, nextState)
				}
			})
			pendingStates.length = 0
		}
		return state
	},
	clearCallbacks() {
		let { pendingCallbacks, instance } = this
		if (pendingCallbacks.length > 0) {
			this.pendingCallbacks = []
			pendingCallbacks.forEach(callback => callback.call(instance))
		}
	},
	addCallback(callback) {
		if (_.isFn(callback)) {
			_.addItem(this.pendingCallbacks, callback)
		}
	}
}

export default function Component(props, context) {
	this.$updater = new Updater(this)
	this.$cache = { isMounted: false }
	this.props = props
	this.state = {}
	this.refs = {}
	this.context = context
}

const ReactComponentSymbol = {}

Component.prototype = {
	constructor: Component,
	isReactComponent: ReactComponentSymbol,
	// getChildContext: _.noop,
	// componentWillUpdate: _.noop,
	// componentDidUpdate: _.noop,
	// componentWillReceiveProps: _.noop,
	// componentWillMount: _.noop,
	// componentDidMount: _.noop,
	// componentWillUnmount: _.noop,
	// shouldComponentUpdate(nextProps, nextState) {
	// 	return true
	// },
	forceUpdate(callback) {
		let { $updater, $cache, props, state, context } = this
		if (!$cache.isMounted) {
			return
		}
		// if updater is pending, add state to trigger nexttick update
		if ($updater.isPending) {
            $updater.addState(state)
			return;
		}
		let nextProps = $cache.props || props
		let nextState = $cache.state || state
		let nextContext = $cache.context || context
		let parentContext = $cache.parentContext
		let node = $cache.node
		let vnode = $cache.vnode
		$cache.props = $cache.state = $cache.context = null
		$updater.isPending = true
		if (this.componentWillUpdate) {
			this.componentWillUpdate(nextProps, nextState, nextContext)
		}
		this.state = nextState
		this.props = nextProps
		this.context = nextContext
	    let newVnode = renderComponent(this)
		let newNode = compareTwoVnodes(vnode, newVnode, node, getChildContext(this, parentContext))
		if (newNode !== node) {
			newNode.cache = newNode.cache || {}
			syncCache(newNode.cache, node.cache, newNode)
		}
		$cache.vnode = newVnode
		$cache.node = newNode
		clearPending()
		if (this.componentDidUpdate) {
			this.componentDidUpdate(props, state, context)
		}
		if (callback) {
			callback.call(this)
		}
		$updater.isPending = false
		$updater.emitUpdate()
	},
	setState(nextState, callback) {
		let { $updater } = this
		$updater.addCallback(callback)
		$updater.addState(nextState)
	},
	replaceState(nextState, callback) {
		let { $updater } = this
		$updater.addCallback(callback)
		$updater.replaceState(nextState)
	},
	getDOMNode() {
		let node = this.$cache.node
		return node && (node.nodeName === '#comment') ? null : node
	},
	isMounted() {
		return this.$cache.isMounted
	}
}

function shouldUpdate(component, nextProps, nextState, nextContext, callback) {
	let shouldComponentUpdate = true
	if (component.shouldComponentUpdate) {
		shouldComponentUpdate = component.shouldComponentUpdate(nextProps, nextState, nextContext)
	}
	if (shouldComponentUpdate === false) {
		component.props = nextProps
		component.state = nextState
		component.context = nextContext || {}
		if(callback) {
			callback.call(component)
		}
		return
	}
	let cache = component.$cache
	cache.props = nextProps
	cache.state = nextState
	cache.context = nextContext || {}
	component.forceUpdate(callback)
}
