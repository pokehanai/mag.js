/*
MagJS v0.20
http://github.com/magnumjs/mag.js
(c) Michael Glazer
License: MIT
*/
(function(mag, document, undefined) {

  'use strict';

  var hookins = {
    attributes: [],
    elementMatcher: []
  }


  mag.create = function(id, module, props) {
    return function(id2, props2) {
      if (typeof id2 !== 'string') {
        props2 = [].concat(id2)[0]
        id2 = 0
      }
      return mag.module(id2 || id, module, mag.utils.merge(props || {}, props2 || {}))
    }
  }

  mag.module = function(id, mod, props) {

    props = props || {}


    // already here before?
    if (mag.utils.items.isItem(id)) {
      if (reloader(mag.utils.items.getItem(id), getNode(id))) return;
    }


    // get unique instance ID if not exists or with props.key
    var idInstance;
    // get unique instance ID if not exists or with props.key
    if (props.key && mag.utils.items.isItem(id + '.' + props.key)) {
      idInstance = mag.utils.items.getItem(id + '.' + props.key)
    } else {
      idInstance = mag.utils.getItemInstanceId(props.key ? id + '.' + props.key : id)
    }


    // TODO: cache/ clearable
    // clear cache if exists
    if (!props.retain) mag.mod.clear(idInstance)

    // get unqiue instance ID's module
    mag.mod.submodule(id, idInstance, mod, props)

    // NODE
    var node = getNode(id)

    //WATCH
    observer(idInstance, id)

    // LIFE CYCLE EVENT
    if (mag.utils.callLCEvent('willload', mag.mod.getState(idInstance), node, idInstance, 1)) return;

    // unloader handlers in controller
    addControllerUnloaders(idInstance)


    // DRAW async
    mag.redraw(node, idInstance, 1)

    // LIFE CYCLE EVENT
    mag.utils.callLCEvent('didload', mag.mod.getState(idInstance), node, idInstance, 1)


    // return function to clone create new clone instances ;)
    return makeClone(idInstance, node, mod, props)
  }

  var isValidId = function(nodeId, idInstance) {

    // verify idInstance
    if (idInstance < 0 || idInstance != mag.utils.items.getItem(nodeId)) {
      //console.error('invalid index for node', idInstance, nodeId, mag.mod.getId(idInstance))
      // if original id is a match
      if (nodeId == mag.mod.getId(idInstance)) return true;
      return false
    }
    return true
  }

  mag.redraw = function(node, idInstance, force) {
    if (!node || typeof idInstance == 'undefined') {
      throw Error('Mag.JS - Id or node invalid: ' + node.id, idInstance);
    }

    // verify idInstance
    if (!isValidId(node.id, idInstance)) {
      // console.warn('invalid index for node', idInstance, node.id)
      return
    }

    // check for existing frame id then clear it if exists

    var ofid = mag.mod.getFrameId(idInstance)
    if (ofid) {
      // console.info('clearing existing fid for instance', ofid, idInstance, node.id)
      fastdom.clear(ofid)
    }
    // clear existing configs ?
    // TODO: per idInstance / id ?
    mag.fill.configs.splice(0, mag.fill.configs.length)

    if (force) mag.mod.clear(idInstance)

    // console.info('makeredraw create', idInstance, node.id)
    var fun = mag.throttle(makeRedrawFun(node, idInstance, force))



    //ENQUEUE
    var fid = fastdom.write(fun);
    //save frame id with the instance 
    mag.mod.setFrameId(idInstance, fid)
      // then if instance already has frame id create new discard old or just retain old
  }

  mag.hookin = function(name, key, handler) {
    hookins[name].push({
      context: {},
      handler: handler,
      key: key
    })
  }

  mag.hook = function(name, key, data) {
    for (var i = 0, size = hookins[name].length; i < size; i++) {
      mag.utils.callHook(hookins, key, name, i, data)
    }
  }


  var makeClone = function(idInstance, node, mod, props) {
    var a = function(id, node, mod, props, index) {

      var cloner = node.cloneNode(1)
      cloner.id = node.id + (props.key ? '.' + props.key : '') + '.' + index;

      // if clone already exists return ?
      if (mag.utils.items.isItem(cloner.id)) {
        // return
      }

      var idInstance2 = mag.utils.getItemInstanceId(cloner.id)

      // get unqiue instance ID's module
      mag.mod.submodule(cloner.id, idInstance2, mod, props)

      observer(idInstance2, cloner.id)

      // DRAW
      mag.redraw(cloner, idInstance2, 1)
      return cloner
    }.bind({}, idInstance, node, mod, props)

    //BOUND CLONE INSTANCE METHODS
    a.getId = function(ids) {
      return idInstance
    }.bind({}, idInstance)
    a.draw = function(node, ids, force) {
      mag.redraw(node, ids, force)
    }.bind({}, node, idInstance)
    a.getState = function(ids) {
      return [].concat(mag.mod.getState(ids))[0]
    }.bind({}, idInstance)

    // a.toJSON = function(ids) {}.bind({}, idInstance)

    return a
  }
  var nodeCache = []

  function getNode(id) {
    //cache nodes?
    if (nodeCache[id]) return nodeCache[id]
    var node = document.getElementById(id);
    if (node) nodeCache[id] = node
    if (!node) {
      // throw Error('invalid node id: ' + id);
    }
    return node;
  }

  var observer = function(idInstance, nodeId) {
    var callback = function(index, id, change) {
      // console.debug('observer called', index, id)
      if (getNode(id)) {
        mag.redraw(getNode(id), index)
      } else if (mag.utils.items.isItem(nodeId)) {
        fastdom.clear(mag.mod.getFrameId(index))
          // remove from indexes
        mag.utils.items.removeItem(index)
          //mag.mod.remove(index)
        mag.mod.clear(index)
          //observer index
        mag.props.cached.splice(index, 1)
          //throw Error('invalid node id ' + id + ' index ' + index)
      }
    }.bind({}, idInstance, nodeId)
    mag.props.setup(idInstance, mag.debounce(callback))
  }


  var makeRedrawFun = function(node1, idInstance1, force1) {
    return function(node, idInstance, force) {

      // verify idInstance
      if (!isValidId(node.id, idInstance) || !node) {
        // console.warn('invalid index for node', idInstance, node.id)
        return
      }

      // console.debug('makeredraw exec', idInstance, node.id)


      var state = mag.mod.getState(idInstance)


      // LIFE CYCLE EVENT
      if (mag.utils.callLCEvent('isupdate', state, node, idInstance)) return;

      var props = mag.mod.getProps(idInstance)


      var data = mag.utils.merge(mag.utils.copy(state), mag.utils.copy(props))


      // CACHED?
      if (mag.mod.iscached(idInstance, data) && !force) {
        return 0;
      };


      // LIFE CYCLE EVENT
      if (mag.utils.callLCEvent('willupdate', state, node, idInstance)) return;
      //console.log(node.id, idInstance)

      //console.info(node, idInstance, mag.utils.items.isItem(node.id), mag.utils.items.getItemVal(idInstance))

      //RUN VIEW FUN
      mag.mod.callView(node, idInstance);

      //START DOM
      var display = node.style.display || ''
      node.style.display = 'none'
      var node = mag.fill.run(node, state)
      node.style.display = display
        // END DOM


      //CONFIGS
      callConfigs(node.id, mag.fill.configs)

      // add configs unloaders
      addConfigUnloaders(node.id, idInstance)

      // LIFE CYCLE EVENT
      mag.utils.callLCEvent('didupdate', state, node)

    }.bind({}, node1, idInstance1, force1)
  }


  var callConfigs = function(id, configs) {
    for (var k in configs) {
      if (k.indexOf('id("' + id + '")/') > -1) {
        configs[k]()
      }
    }
  }

  var addControllerUnloaders = function(idInstance) {
    // TODO: controller unloaders
    var state = mag.mod.getState(idInstance)
    mag.utils.unloaders[idInstance] = mag.utils.unloaders[idInstance] || []
    if (state.onunload) mag.utils.unloaders[idInstance].push({
      controller: state,
      handler: state.onunload
    })
  }

  var addConfigUnloaders = function(id, index) {


    for (var k in mag.fill.cached) {
      //console.log(module.elements[index].id, k)
      if (k.indexOf('id("' + id + '")/') > -1 && k.indexOf('-config') > -1 && mag.fill.cached[k].configContext) {
        // console.log(k, mag.fill.cached[k].configContext.onunload)

        mag.utils.unloaders[index] = mag.utils.unloaders[index] || []

        mag.utils.unloaders[index].push({
          controller: mag.fill.cached[k].configContext,
          handler: mag.fill.cached[k].configContext.onunload
        })

      }
    }
  }


  var reloader = function(idInstance, node) {
    return mag.utils.callLCEvent('onreload', mag.mod.getState(idInstance), node, idInstance)
  }

  window.mag = mag


})(window.mag || {}, document);
