import * as _ from './util'
import {
	COMPONENT_ID,
	VELEMENT,
	VCOMPONENT,
	ELEMENT_NODE_TYPE,
	DOC_NODE_TYPE,
	DOCUMENT_FRAGMENT_NODE_TYPE
} from './constant'
import { initVnode, destroyVnode, clearPending, compareTwoVnodes } from './virtual-dom'
import { updateQueue } from './Component'

function isValidContainer(node) {
    return !!(node && (
        node.nodeType === ELEMENT_NODE_TYPE ||
        node.nodeType === DOC_NODE_TYPE ||
        node.nodeType === DOCUMENT_FRAGMENT_NODE_TYPE
    ))
}

let pendingRendering = {}
let vnodeStore = {}
function renderTreeIntoContainer(vnode, container, callback, parentContext) {
	if (!vnode.vtype) {
		throw new Error(`cannot render ${ vnode } to container`)
	}
	if (!isValidContainer(container)) {
		throw new Error(`container ${container} is not a DOM element`)
	}
	let id = container[COMPONENT_ID] || (container[COMPONENT_ID] = _.getUid())
	let argsCache = pendingRendering[id]

	// component lify cycle method maybe call root rendering
	// should bundle them and render by only one time
	if (argsCache) {
		if (argsCache === true) {
			pendingRendering[id] = argsCache = { vnode, callback, parentContext }
		} else {
			argsCache.vnode = vnode
			argsCache.parentContext = parentContext
			argsCache.callback = argsCache.callback ? _.pipe(argsCache.callback, callback) : callback
		}
		return
	}

	pendingRendering[id] = true
	let oldVnode = null
	let rootNode = null
	if (oldVnode = vnodeStore[id]) {
		rootNode = compareTwoVnodes(oldVnode, vnode, container.firstChild, parentContext)
	} else {
		rootNode = initVnode(vnode, parentContext, container.namespaceURI)
		var childNode = null
		while (childNode = container.lastChild) {
			container.removeChild(childNode)
		}
		container.appendChild(rootNode)
	}
	vnodeStore[id] = vnode
	let isPending = updateQueue.isPending
	updateQueue.isPending = true
	clearPending()
	argsCache = pendingRendering[id]
	delete pendingRendering[id]

	let result = null
	if (typeof argsCache === 'object') {
		result = renderTreeIntoContainer(argsCache.vnode, container, argsCache.callback, argsCache.parentContext)
	} else if (vnode.vtype === VELEMENT) {
		result = rootNode
	} else if (vnode.vtype === VCOMPONENT) {
		result = rootNode.cache[vnode.uid]
	}

	if (!isPending) {
		updateQueue.isPending = false
		updateQueue.batchUpdate()
	}

	if (callback) {
		callback.call(result)
	}

	return result
}

export function render(vnode, container, callback) {
	return renderTreeIntoContainer(vnode, container, callback)
}

export function unstable_renderSubtreeIntoContainer(parentComponent, subVnode, container, callback) {
	let context = parentComponent.$cache.parentContext
	return renderTreeIntoContainer(subVnode, container, callback, context)
}

export function unmountComponentAtNode(container) {
	if (!container.nodeName) {
		throw new Error('expect node')
	}
	let id = container[COMPONENT_ID]
	let vnode = null
	if (vnode = vnodeStore[id]) {
		destroyVnode(vnode, container.firstChild)
		container.removeChild(container.firstChild)
		delete vnodeStore[id]
		return true
	}
	return false
}

export function findDOMNode(node) {
	if (node == null) {
		return null
	}
	if (node.nodeName) {
		return node
	}
	let component = node
	// if component.node equal to false, component must be unmounted
	if (component.getDOMNode && component.$cache.isMounted) {
		return component.getDOMNode()
	}
	throw new Error('findDOMNode can not find Node')
}