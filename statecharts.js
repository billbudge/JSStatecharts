// Statecharts module.

const statecharts = (function() {
'use strict';

// Free functions.

function isStartState(item) {
  return item.type === 'start';
}

function isStopState(item) {
  return item.type === 'stop';
}

function isHistoryState(item) {
  return item.type === 'history' || item.type === 'history*';
}

function isPseudostate(item) {
  return isStartState(item) || isStopState(item) || isHistoryState(item);
}

function isStartingState(item) {
  return isStartState(item) || isHistoryState(item);
}

function isState(item) {
  return item.type === 'state' || isPseudostate(item);
}

function isTrueState(item) {
  return item.type === 'state';
}

function isStatechart(item) {
  return item.type === 'statechart';
}

function isStateOrStatechart(item) {
  return item.type === 'statechart' || isState(item);
}

function isTrueStateOrStatechart(item) {
  return item.type === 'state' || item.type === 'statechart';
}

function isTransition(item) {
  return item.type === 'transition';
}

function isNonTransition(item) {
  return !isTransition(item);
}

// Visit in pre-order.
function visitItem(item, fn, filter) {
  if (!filter || filter(item)) {
    fn(item);
  }
  if (isTrueStateOrStatechart(item) && item.items) {
    visitItems(item.items, fn, filter);
  }
}

function visitItems(items, fn, filter) {
  items.forEach(item => visitItem(item, fn, filter));
}

// Visit in post-order.
function reverseVisitItem(item, fn, filter) {
  if (isTrueStateOrStatechart(item) && item.items) {
    reverseVisitItems(item.items, fn, filter);
  }
  if (!filter || filter(item)) {
    fn(item);
  }
}

function reverseVisitItems(items, fn, filter) {
  for (let i = items.length - 1; i >= 0; i--) {
    reverseVisitItem(items[i], fn, filter);
  }
}

const _bezier = Symbol('bezier'),
      _p1 = Symbol('p1'),
      _p2 = Symbol('p2'),
      _text = Symbol('text'),
      _textT = Symbol('textT'),  // transition attachment parameter along curve;
      _textWidth = Symbol('textWidth'),
      _entryText = Symbol('entryText'),
      _entryY = Symbol('entryY'),
      _exitText = Symbol('exitText'),
      _exitY = Symbol('exitY');

function extendTheme(theme) {
  const r = 8,
        v = r / 2,
        h = r / 3;
  const extensions = {
    radius: r,
    textIndent: 8,
    textLeading: 6,
    arrowSize: 8,
    knobbyRadius: 4,
    padding: 8,

    stateMinWidth: 100,
    stateMinHeight: 60,  // TODO make sure there's room for entry/exit action text

    // Rather than try to render actual text for H and H* into the pseudostate disk,
    // render the glyphs as moveto/lineto pairs.
    HGlyph: [-h, -v, -h, v, -h, 0, h, 0, h, -v, h, v],
    StarGlyph: [-h, -v / 3, h, v / 3, -h, v / 3, h, -v / 3, 0, -v / 1.5, 0, v / 1.5],
  }
  return Object.assign(diagrams.theme.createDefault(), extensions, theme);
}

//------------------------------------------------------------------------------

// Maintains:
// - maps from element to connected transitions.
// - information about graphs and subgraphs.

const _inTransitions = Symbol('inTransitions'),
      _outTransitions = Symbol('outTransitions');

const statechartModel = (function() {

  const proto = {
    getInTransitions: function(state) {
      assert(isState(state));
      return state[_inTransitions];
    },

    getOutTransitions: function(state) {
      assert(isState(state));
      return state[_outTransitions];
    },

    forInTransitions: function(state, fn) {
      const inputs = this.getInTransitions(state);
      if (!inputs)
        return;
      inputs.forEach((input, i) => fn(input, i));
    },

    forOutTransitions: function(state, fn) {
      const outputs = this.getOutTransitions(state);
      if (!outputs)
        return;
      outputs.forEach((output, i) => fn(output, i));
    },

    getGraphInfo: function() {
      return {
        statesAndStatecharts: this.statesAndStatecharts_,
        transitions: this.transitions_,
        interiorTransitions: this.transitions_,
        inTransitions: new diagrammar.collections.EmptySet(),
        outTransitions: new diagrammar.collections.EmptySet(),
      }
    },

    getSubgraphInfo: function(items) {
      const self = this,
            statesAndStatecharts = new Set(),
            transitions = new Set(),
            interiorTransitions = new Set(),
            inTransitions = new Set(),
            outTransitions = new Set();
      // First collect states and statecharts.
      visitItems(items, function(item) {
        statesAndStatecharts.add(item);
      }, isStateOrStatechart);
      // Now collect and classify transitions that connect to them.
      visitItems(items, function(state) {
        function addTransition(transition) {
          // Stop if we've already processed this transtion (handle transitions from a state to itself.)
          if (transitions.has(transition)) return;
          transitions.add(transition);
          const src = self.getTransitionSrc(transition),
                dst = self.getTransitionDst(transition),
                srcInside = statesAndStatecharts.has(src),
                dstInside = statesAndStatecharts.has(dst);
          if (srcInside) {
            if (dstInside) {
              interiorTransitions.add(transition);
            } else {
              outTransitions.add(transition);
            }
          }
          if (dstInside) {
            if (!srcInside) {
              inTransitions.add(transition);
            }
          }
        }
        self.forInTransitions(state, addTransition);
        self.forOutTransitions(state, addTransition);
      }, isState);

      return {
        statesAndStatecharts: statesAndStatecharts,
        transitions: transitions,
        interiorTransitions: interiorTransitions,
        inTransitions: inTransitions,
        outTransitions: outTransitions,
      }
    },

    getConnectedStates: function(items, upstream, downstream) {
      const self = this,
            result = new Set();
      while (items.length > 0) {
        const item = items.pop();
        if (!isState(item))
          continue;

        result.add(item);

        if (upstream) {
          this.forInTransitions(item, function(transition) {
            const src = self.getTransitionSrc(transition);
            if (!result.has(src))
              items.push(src);
          });
        }
        if (downstream) {
          this.forOutTransitions(item, function(transition) {
            const dst = self.getTransitionDst(transition);
            if (!result.has(dst))
              items.push(dst);
          });
        }
      }
      return result;
    },

    getTopLevelState: function(item) {
      const hierarchicalModel = this.model.hierarchicalModel,
            topLevelStatechart = this.statechart;
      let result;
      do {
        result = item;
        item = hierarchicalModel.getParent(item);
      } while (item && item !== topLevelStatechart);
      return result;
    },

    insertState_: function(state) {
      this.statesAndStatecharts_.add(state);
      if (state[_inTransitions] === undefined) {
        assert(state[_outTransitions] === undefined);
        state[_inTransitions] = new Array();
        state[_outTransitions] = new Array();
      }
      if (state.items) {
        const self = this;
        state.items.forEach(subItem => self.insertItem_(subItem));
      }
    },

    removeState_: function(state) {
      this.statesAndStatecharts_.delete(state);
    },

    insertStatechart_: function(statechart) {
      this.statesAndStatecharts_.add(statechart);
      const self = this;
      statechart.items.forEach(subItem => self.insertItem_(subItem));
    },

    removeStatechart_: function(stateChart) {
      this.statesAndStatecharts_.delete(stateChart);
      const self = this;
      stateChart.items.forEach(subItem => self.removeItem_(subItem));
    },

    insertTransition_: function(transition) {
      this.transitions_.add(transition);
      const src = this.getTransitionSrc(transition),
            dst = this.getTransitionDst(transition);
      if (src) {
        const outputs = this.getOutTransitions(src);
        if (outputs)
          outputs.push(transition);
      }
      if (dst) {
        const inputs = this.getInTransitions(dst);
        if (inputs)
          inputs.push(transition);
      }
    },

    removeTransition_: function(transition) {
      this.transitions_.delete(transition);
      const src = this.getTransitionSrc(transition),
            dst = this.getTransitionDst(transition);
      function remove(array, item) {
        const index = array.indexOf(item);
        if (index >= 0) {
          array.splice(index, 1);
        }
      }
      if (src) {
        const outputs = this.getOutTransitions(src);
        if (outputs)
          remove(outputs, transition);
      }
      if (dst) {
        const inputs = this.getInTransitions(dst);
        if (inputs)
          remove(inputs, transition);
      }
    },

    insertProperty_: function(property) {
      this.properties_.add(property);
    },

    removeProperty_: function(property) {
      this.properties_.delete(property);
    },

    insertItem_: function(item) {
      if (isState(item)) {
        this.insertState_(item);
      } else if (isTransition(item)) {
        this.insertTransition_(item);
      } else if (isStatechart(item)) {
        this.insertStatechart_(item);
      }
    },

    removeItem_: function(item) {
      if (isState(item)) {
        this.removeState_(item);
      } else if (isTransition(item)) {
        this.removeTransition_(item);
      } else if (isStatechart(item)) {
        this.removeStatechart_(item);
      }
    },

    onChanged_: function (change) {
      const item = change.item,
            attr = change.attr;
      switch (change.type) {
        case 'change': {
          if (isTransition(item)) {
            // Remove and reinsert changed transitions.
            this.removeTransition_(item);
            this.insertTransition_(item);
          }
          break;
        }
        case 'insert': {
          const newValue = item[attr][change.index];
          this.insertItem_(newValue);
          break;
        }
        case 'remove': {
          const oldValue = change.oldValue;
          this.removeItem_(oldValue);
        }
      }
    },
  }

  function extend(model) {
    if (model.statechartModel)
      return model.statechartModel;

    dataModels.hierarchicalModel.extend(model);
    dataModels.observableModel.extend(model);
    dataModels.referencingModel.extend(model);

    let instance = Object.create(proto);
    instance.model = model;
    instance.statechart = model.root;

    instance.statesAndStatecharts_ = new Set();
    instance.transitions_ = new Set();
    instance.properties_ = new Set();
    instance.changedTopLevelStates_ = new Set();

    model.observableModel.addHandler('changed',
                                     change => instance.onChanged_(change));

    instance.getTransitionSrc = model.referencingModel.getReferenceFn('srcId');
    instance.getTransitionDst = model.referencingModel.getReferenceFn('dstId');

    // Initialize tracking of all items.
    visitItem(instance.statechart, function(item) {
      instance.insertItem_(item);
    });

    model.statechartModel = instance;
    return instance;
  }

  return {
    extend: extend,
  }
})();

//------------------------------------------------------------------------------

const editingModel = (function() {
  const proto = {
    getParent: function(item) {
      return this.model.hierarchicalModel.getParent(item);
    },

    reduceSelection: function () {
      const model = this.model;
      model.selectionModel.set(model.hierarchicalModel.reduceSelection());
    },

    selectInteriorTransitions: function() {
      const model = this.model,
            selectionModel = model.selectionModel,
            graphInfo = model.statechartModel.getSubgraphInfo(selectionModel.contents());
      selectionModel.add(graphInfo.interiorTransitions);
    },

    newItem: function(item) {
      const dataModel = this.model.dataModel;
      dataModel.assignId(item);
      dataModel.initialize(item);
      return item;
    },

    newItems: function(items) {
      const self = this;
      items.forEach(item => self.newItem(item));
    },

    copyItems: function(items, map) {
      const model = this.model,
            dataModel = model.dataModel,
            translatableModel = model.translatableModel,
            statechart = this.statechart,
            copies = model.copyPasteModel.cloneItems(items, map);

      items.forEach(function(item) {
        const copy = map.get(dataModel.getId(item));
        if (isNonTransition(copy)) {
          const translation = translatableModel.getToParent(item, statechart);
          copy.x += translation.x;
          copy.y += translation.y;
        }
      });
      return copies;
    },

    deleteItem: function(item) {
      const model = this.model,
            hierarchicalModel = model.hierarchicalModel,
            parent = hierarchicalModel.getParent(item);
      if (parent) {
        const items = parent.items;
        for (let i = 0; i < items.length; i++) {
          const subItem = items[i];
          if (subItem === item) {
            model.observableModel.removeElement(parent, 'items', i);
            model.selectionModel.remove(item);
            break;
          }
        }
      }
    },

    deleteItems: function(items) {
      const self = this;
      items.forEach(function(item) {
        self.deleteItem(item);
      }, this);
    },

    isTopLevelStatechart: function(item) {
      return isStatechart(item) && !this.getParent(item);
    },

    // Returns a value indicating if the item can be added to the state
    // without violating statechart constraints.
    canAddState: function(state, statechart) {
      // The only constraint is that there can't be two start states in a statechart.
      if (!isStartState(state))
        return true;
      for (let item of statechart.items) {
        if (isStartState(item) && item !== state)
          return false;
      }
      return true;
    },

    isValidTransition: function(src, dst) {
      if (!src || !dst) return false;
      // No transition to self for pseudostates.
      if (src == dst) return !isPseudostate(src);
      // No transitions to a start pseudostate.
      if (isStartState(dst)) return false;
      // No transitions from a stop pseudostate.
      if (isStopState(src)) return false;
      // No transitions out of parent state for start or history pseudostates.
      if (isStartingState(src)) {
        const srcParent = this.getParent(src),
              dstParent = this.getParent(dst);
        return srcParent == dstParent;
      }
      // Transitions can't straddle parallel statecharts. The lowest common ancestor
      // of src and dst must be a statechart, not a state.
      const hierarchicalModel = this.model.hierarchicalModel,
            lca = hierarchicalModel.getLowestCommonAncestor(src, dst);
      return isStatechart(lca);
    },

    addItem: function(item, parent, paletteItem) {
      const model = this.model,
            observableModel = model.observableModel,
            hierarchicalModel = model.hierarchicalModel,
            oldParent = hierarchicalModel.getParent(item);

      if (!parent)
        parent = this.statechart;

      if (isState(parent)) {
        if (isPseudostate(parent)) return;
        parent = this.findOrCreateChildStatechart(parent, item);
      } else if (isStatechart(parent)) {
        // If adding a pseudostate to a non-root statechart, add a new statechart to hold it.
        // We allow the exception for the root statechart so we can drag and drop between
        // child statecharts.
        if (!this.canAddState(item, parent) && !this.isTopLevelStatechart(parent)) {
          const superState = hierarchicalModel.getParent(parent);
          parent = this.findOrCreateChildStatechart(superState, item);
        }
      }
      // At this point we can add item to parent.
      if (isState(item)) {
        const translatableModel = model.translatableModel,
              translation = translatableModel.getToParent(item, parent);
        this.setAttr(item, 'x', item.x + translation.x);
        this.setAttr(item, 'y', item.y + translation.y);
      }

      if (oldParent === parent)
        return;
      if (oldParent)
        this.deleteItem(item);

      let attr = paletteItem ? 'palette' : 'items';
      observableModel.insertElement(parent, attr, parent[attr].length, item);
      return item;
    },

    addItems: function(items, parent) {
      // Add elements and groups first, then wires, so circuitModel can update.
      for (let item of items) {
        if (!isTransition(item)) this.addItem(item, parent);
      }
      for (let item of items) {
        if (isTransition(item)) this.addItem(item, parent);
      }
    },

    // Creates a new statechart.
    newStatechart: function(y) {
      const statechart = {
        type: 'statechart',
        x: 0,
        y: y || 0,
        width: 0,
        height: 0,
        items: new Array(),
      };
      return this.newItem(statechart);
    },

    setAttr: function(item, attr, value) {
      this.model.observableModel.changeValue(item, attr, value);
    },

    findChildStatechart: function(state, newItem) {
      if (state.items) {
        for (let i = 0; i < state.items.length; i++) {
          if (this.canAddState(newItem, state.items[i]))
            return i;
        }
      }
      return -1;
    },

    findOrCreateChildStatechart: function(state, newItem) {
      let i = this.findChildStatechart(state, newItem);
      if (i < 0) {
        if (!state.items)
          this.setAttr(state, 'items', new Array());
        i = state.items.length;
        const y = this.model.renderer.getNextStatechartY(state);
        const statechart = this.newStatechart(y);
        this.model.observableModel.insertElement(state, 'items', i, statechart);
      }
      return state.items[i];
    },

    getLabel: function (item) {
      if (isTrueState(item)) return item.name;
    },

    doDelete: function() {
      this.reduceSelection();
      this.model.copyPasteModel.doDelete(this.deleteItems.bind(this));
    },

    doCopy: function() {
      const selectionModel = this.model.selectionModel;
      selectionModel.contents().forEach(function(item) {
        if (isTransition(item))
          selectionModel.remove(item);
      });
      this.selectInteriorTransitions();
      this.reduceSelection();
      this.model.copyPasteModel.doCopy(this.copyItems.bind(this));
    },

    doCut: function() {
      this.doCopy();
      this.doDelete();
    },

    doPaste: function() {
      const copyPasteModel = this.model.copyPasteModel;
      copyPasteModel.getScrap().forEach(function(item) {
        // Offset pastes so the user can see them.
        if (isState(item)) {
          item.x += 16;
          item.y += 16;
        }
      });
      copyPasteModel.doPaste(this.copyItems.bind(this),
                             this.addItems.bind(this));
    },

    doSelectConnectedStates: function(upstream) {
      const model = this.model,
            selectionModel = model.selectionModel,
            selection = selectionModel.contents(),
            statechartModel = model.statechartModel,
            newSelection =
                statechartModel.getConnectedStates(selection, upstream, true);
      selectionModel.set(newSelection);
    },

    doTogglePalette: function() {
      // const model = this.model;
      // this.reduceSelection();
      // model.transactionModel.beginTransaction('toggle master state');
      // model.selectionModel.contents().forEach(function(item) {
      //   if (!isState(item))
      //     return;
      //   model.observableModel.changeValue(item, 'state',
      //     (item.state === 'palette') ? 'normal' : 'palette');
      // })
      // model.transactionModel.endTransaction();
    },

    makeConsistent: function () {
      const self = this, model = this.model,
            statechart = this.statechart,
            dataModel = model.dataModel,
            hierarchicalModel = model.hierarchicalModel,
            selectionModel = model.selectionModel,
            observableModel = model.observableModel,
            graphInfo = model.statechartModel.getGraphInfo();
      // Eliminate dangling transitions.
      graphInfo.transitions.forEach(function(transition) {
        const src = self.getTransitionSrc(transition),
              dst = self.getTransitionDst(transition);
        if (!src || !graphInfo.statesAndStatecharts.has(src) ||
            !dst || !graphInfo.statesAndStatecharts.has(dst)) {
          self.deleteItem(transition);
          return;
        }
        // Make sure transitions belong to lowest common statechart.
        const srcParent = hierarchicalModel.getParent(src),
              dstParent = hierarchicalModel.getParent(dst),
              lca = hierarchicalModel.getLowestCommonAncestor(srcParent, dstParent);
        if (self.getParent(transition) !== lca) {
          self.deleteItem(transition);
          self.addItem(transition, lca);
        }
      });
      // Delete any empty statecharts (except for the root statechart).
      graphInfo.statesAndStatecharts.forEach(function(item) {
        if (isStatechart(item) &&
            !self.isTopLevelStatechart(item) &&
            item.items.length === 0)
          self.deleteItem(item);
      });
    },

    isValidStatechart: function(statechart) {
      const self = this;
      let startingStates = 0;
      // A statechart is valid if its states and transitions are valid.
      let isValid = statechart.items.every(function(item) {
        if (isTransition(item)) {
          return self.isValidTransition(self.getTransitionSrc(item),
                                        self.getTransitionDst(item));
        }
        if (isStartState(item)) {
          startingStates++;
        } else if (isState(item) && item.items) {
          return item.items.every(item => { return self.isValidStatechart(item); });
        }
        // All other items are valid.
        return true;
      });
      // We have to allow no starting state as we build the statechart.
      return isValid && startingStates <= 1;
    },
  }

  function extend(model) {
    dataModels.dataModel.extend(model);
    dataModels.observableModel.extend(model);
    dataModels.selectionModel.extend(model);
    dataModels.referencingModel.extend(model);
    dataModels.hierarchicalModel.extend(model);
    dataModels.translatableModel.extend(model);
    dataModels.transactionModel.extend(model);
    dataModels.transactionHistory.extend(model);
    dataModels.instancingModel.extend(model);
    dataModels.copyPasteModel.extend(model);

    const instance = Object.create(model.copyPasteModel);
    instance.prototype = Object.getPrototypeOf(instance);
    for (let prop in proto)
      instance[prop] = proto[prop];

    instance.model = model;
    instance.statechart = model.root;

    instance.getTransitionSrc = model.referencingModel.getReferenceFn('srcId');
    instance.getTransitionDst = model.referencingModel.getReferenceFn('dstId');

    model.transactionModel.addHandler('transactionEnding',
                                      transaction => instance.makeConsistent());

    model.editingModel = instance;
    return instance;
  }

  return {
    extend: extend,
  }
})();

//------------------------------------------------------------------------------

const normalMode = 1,
      highlightMode = 2,
      hotTrackMode = 3,
      printMode = 4;

function Renderer(model, theme) {
  this.model = model;
  model.renderer = this;

  this.theme = extendTheme(theme);

  const translatableModel = model.translatableModel,
        referencingModel = model.referencingModel;

  assert(translatableModel);
  assert(referencingModel);

  this.translatableModel = translatableModel;
  this.referencingModel = referencingModel;

  this.getTransitionSrc = referencingModel.getReferenceFn('srcId');
  this.getTransitionDst = referencingModel.getReferenceFn('dstId');
}

Renderer.prototype.begin = function(ctx) {
  this.ctx = ctx;
  ctx.save();
  ctx.font = this.theme.font;
}

Renderer.prototype.end = function() {
  this.ctx.restore();
  this.ctx = null;
}

function drawArrow(renderer, x, y) {
  const ctx = renderer.ctx;
  ctx.beginPath();
  diagrams.arrowPath({ x: x, y: y, nx: -1, ny: 0 }, ctx, renderer.theme.arrowSize);
  ctx.stroke();
}

function hitTestArrow(renderer, x, y, p, tol) {
  const d = renderer.theme.arrowSize, r = d * 0.5;
  return diagrams.hitTestRect(x - r, y - r, d, d, p, tol);
}

Renderer.prototype.getSize = function(item) {
  let width, height;
  switch (item.type) {
    case 'state':
    case 'statechart':
      width = item.width;
      height = item.height;
      break;
    case 'start':
    case 'stop':
    case 'history':
    case 'history*':
      width = height = 2 * this.theme.radius;
      break;
  }
  return { width: width, height: height };
}

Renderer.prototype.getItemRect = function (item) {
  let x, y, width, height;
  if  (isTransition(item)) {
    const extents = geometry.getExtents(item[_bezier]);
    x = extents.xmin;
    y = extents.ymin;
    width = extents.xmax - x;
    height = extents.ymax - y;
  } else {
    const size = this.getSize(item),
          translatableModel = this.model.translatableModel;
    x = translatableModel.globalX(item);
    y = translatableModel.globalY(item);
    width = size.width;
    height = size.height;

    if (isStatechart(item)) {
    const parent = this.model.hierarchicalModel.getParent(item);
    if (parent) {
      // Statechart width comes from containing state.
      size.width = this.getSize(parent).width;
    }
    width = size.width;
    height = size.height;
  }
}
  return { x: x, y: y, width: width, height: height };
}

Renderer.prototype.getBounds = function(items) {
  let xMin = 0, yMin = 0, xMax = 0, yMax = 0, first = true;
  for (let item of items) {
    const rect = this.getItemRect(item),
          x0 = rect.x, y0 = rect.y, x1 = x0 + rect.width, y1 = y0 + rect.height;
    if (first) {
      xMin = x0;
      yMin = y0;
      xMax = x1;
      yMax = y1;
      first = false;
    } else {
      xMin = Math.min(xMin, x0);
      yMin = Math.min(yMin, y0);
      xMax = Math.max(xMax, x1);
      yMax = Math.max(yMax, y1);
    }
  }
  return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
}

Renderer.prototype.statePointToParam = function(state, p) {
  const r = this.theme.radius,
        rect = this.getItemRect(state);
  if (isTrueState(state))
    return diagrams.rectPointToParam(rect.x, rect.y, rect.width, rect.height, p);

  return diagrams.circlePointToParam(rect.x + r, rect.y + r, p);
}

Renderer.prototype.stateParamToPoint = function(state, t) {
  const r = this.theme.radius,
        rect = this.getItemRect(state);
  if (isTrueState(state))
    return diagrams.roundRectParamToPoint(rect.x, rect.y, rect.width, rect.height, r, t);

  return diagrams.circleParamToPoint(rect.x + r, rect.y + r, r, t);
}

Renderer.prototype.getStateMinSize = function(state) {
  const ctx = this.ctx, theme = this.theme,
        r = theme.radius;
  let width = theme.stateMinWidth, height = theme.stateMinHeight;
  if (state.type !== 'state')
    return;
  width = Math.max(width, ctx.measureText(state.name).width + 2 * r);
  height = Math.max(height, theme.fontSize + this.textLeading);
  return { width: width, height: height };
}

Renderer.prototype.getNextStatechartY = function(state) {
  let y = 0;
  if (state.items && state.items.length > 0) {
    const lastStatechart = state.items[state.items.length - 1];
    y = lastStatechart.y + lastStatechart.height;
  }
  return y;
}

// Layout a state.
Renderer.prototype.layoutState = function(state) {
  const self = this,
        theme = this.theme,
        textSize = theme.fontSize,
        textLeading = theme.textLeading,
        lineSpacing = textSize + textLeading,
        observableModel = this.model.observableModel;

  let width = 0,
      height = lineSpacing;

  const statecharts = state.items;
  let stateOffsetY = 0;  // start at the top of the state shape.
  if (statecharts && statecharts.length > 0) {
    // Layout the child statecharts vertically within the parent state.
    // TODO handle horizontal flow.
    statecharts.forEach(function(statechart) {
      const size = self.getSize(statechart);
      width = Math.max(width, size.width);
    });
    statecharts.forEach(function(statechart) {
      observableModel.changeValue(statechart, 'y', stateOffsetY);
      observableModel.changeValue(statechart, 'width', width);
      stateOffsetY += statechart.height;
    });

    height = Math.max(height, stateOffsetY);
    // Expand the last statechart to fill its parent state.
    const lastStatechart = statecharts[statecharts.length - 1];
    observableModel.changeValue(lastStatechart, 'height',
          lastStatechart.height + height - stateOffsetY);
  }
  if (state.entry) {
    state[_entryText] = 'entry/ ' + state.entry;
    state[_entryY] = height;
    height += lineSpacing;
    width = Math.max(width, this.ctx.measureText(state[_entryText]).width + 2 * this.theme.padding);
  }
  if (state.exit) {
    state[_exitText] = 'exit/ ' + state.exit;
    state[_exitY] = height;
    height += lineSpacing;
    width = Math.max(width, this.ctx.measureText(state[_exitText]).width + 2 * this.theme.padding);
  }
  width = Math.max(width, theme.stateMinWidth);
  height = Math.max(height, theme.stateMinHeight);
  width = Math.max(width, state.width);
  height = Math.max(height, state.height);
  observableModel.changeValue(state, 'width', width);
  observableModel.changeValue(state, 'height', height);
}

// Make sure a statechart is big enough to enclose its contents. Statecharts
// are always sized automatically to contain their contents and fit tightly in
// their parent state.
Renderer.prototype.layoutStatechart = function(statechart) {
  const padding = this.theme.padding,
        translatableModel = this.model.translatableModel,
        statechartX = translatableModel.globalX(statechart),
        statechartY = translatableModel.globalY(statechart),
        items = statechart.items;
  if (items && items.length) {
    // Get extents of child states.
    const r = this.getBounds(items),
          x = r.x - statechartX,  // Get position in statechart coordinates.
          y = r.y - statechartY,
          observableModel = this.model.observableModel;
    let xMin = Math.min(0, x - padding),
        yMin = Math.min(0, y - padding),
        xMax = x + r.width + padding,
        yMax = y + r.height + padding;
    if (xMin < 0) {
      xMax -= xMin;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (isTransition(item)) continue;
        observableModel.changeValue(item, 'x', item.x - xMin);
      }
    }
    if (yMin < 0) {
      yMax -= yMin;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (isTransition(item)) continue;
        observableModel.changeValue(item, 'y', item.y - yMin);
      }
    }
    // Statechart position is calculated by the parent state layout.
    observableModel.changeValue(statechart, 'width', xMax - xMin);
    observableModel.changeValue(statechart, 'height', yMax - yMin);
  }
}

Renderer.prototype.layoutTransition = function(transition) {
  const self = this,
        src = this.getTransitionSrc(transition),
        dst = this.getTransitionDst(transition),
        p1 = src ? this.stateParamToPoint(src, transition.t1) : transition[_p1],
        p2 = dst ? this.stateParamToPoint(dst, transition.t2) : transition[_p2];
  // If we're in an intermediate state, don't layout.
  if (!p1 || !p2)
    return;
  function projectToCircle(pseudoState, p1, p2) {
    const length = geometry.lineLength(p1.x, p1.y, p2.x, p2.y),
          nx = (p2.x - p1.x) / length,
          ny = (p2.y - p1.y) / length,
          radius = self.theme.radius,
          bbox = self.getItemRect(pseudoState);
    p1.x = bbox.x + bbox.width / 2 + nx * radius;
    p1.y = bbox.y + bbox.height / 2 + ny * radius;
    p1.nx = nx;
    p1.ny = ny;
  }
  if (src && isPseudostate(src)) {
    projectToCircle(src, p1, p2);
  }
  if (dst && isPseudostate(dst)) {
    projectToCircle(dst, p2, p1);
  }
  transition[_bezier] = diagrams.getEdgeBezier(p1, p2);
  transition[_textT] = geometry.evaluateBezier(transition[_bezier], transition.pt);
  let text = '',
      textWidth = 0;
  if (transition.event) {
    text += transition.event;
    textWidth += this.ctx.measureText(transition.event).width + 2 * this.theme.padding;
  }
  if (transition.guard) {
    text += '[' + transition.guard + ']';
    textWidth += this.ctx.measureText(transition.guard).width + 2 * this.theme.padding;
  }
  if (transition.action) {
    text += '/' + transition.action;
    textWidth += this.ctx.measureText(transition.action).width + 2 * this.theme.padding;
  }
  transition[_text] = text;
  transition[_textWidth] = textWidth;
}

// Layout a statechart item.
Renderer.prototype.layout = function(item) {
  if (isTrueState(item)) {
    this.layoutState(item);
  } else if (isStatechart(item)) {
    this.layoutStatechart(item);
  } else if (isTransition(item))
    this.layoutTransition(item);
}

Renderer.prototype.drawState = function(state, mode) {
  const ctx = this.ctx, theme = this.theme, r = theme.radius,
        rect = this.getItemRect(state),
        x = rect.x, y = rect.y, w = rect.width, h = rect.height,
        textSize = theme.fontSize,
        lineBase = y + textSize + theme.textLeading;
  diagrams.roundRectPath(x, y, w, h, r, ctx);
  switch (mode) {
    case normalMode:
    case printMode:
      ctx.fillStyle = theme.bgColor;
      ctx.fill();
      ctx.strokeStyle = theme.strokeColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, lineBase);
      ctx.lineTo(x + w, lineBase);
      ctx.stroke();

      ctx.fillStyle = theme.textColor;
      ctx.fillText(state.name, x + r, y + textSize);
      if (state.entry)
        ctx.fillText(state[_entryText], x + r, y + state[_entryY] + textSize);
      if (state.exit)
        ctx.fillText(state[_exitText], x + r, y + state[_exitY] + textSize);

      const items = state.items;
      if (items) {
        let separatorY = y;
        for (var i = 0; i < items.length - 1; i++) {
          const statechart = items[i];
          separatorY += statechart.height;
          ctx.setLineDash([5]);
          ctx.beginPath();
          ctx.moveTo(x, separatorY);
          ctx.lineTo(x + w, separatorY);
          ctx.stroke();
          ctx.setLineDash([0]);
        }
      }
      // Render knobbies, faintly.
      ctx.lineWidth = 0.25;
      break;
    case highlightMode:
      ctx.strokeStyle = theme.highlightColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    case hotTrackMode:
      ctx.strokeStyle = theme.hotTrackColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
  if (mode !== printMode) {
    drawArrow(this, x + w + theme.arrowSize, lineBase);
  }
}

Renderer.prototype.hitTestState = function(state, p, tol, mode) {
  const theme = this.theme, r = theme.radius,
        rect = this.getItemRect(state),
        x = rect.x, y = rect.y, w = rect.width, h = rect.height,
        result = diagrams.hitTestRect(x, y, w, h, p, tol); // TODO hitTestRoundRect
  if (result) {
    const lineBase = y + theme.fontSize + theme.textLeading;
    if (mode !== printMode && hitTestArrow(this, x + w + theme.arrowSize, lineBase, p, tol))
      result.arrow = true;
  }
  return result;
}

Renderer.prototype.drawPseudoState = function(state, mode) {
  const ctx = this.ctx, theme = this.theme, r = theme.radius,
        rect = this.getItemRect(state),
        x = rect.x, y = rect.y,
        cx = x + r, cy = y + r;
  function drawGlyph(glyph, cx, cy) {
    for (let i = 0; i < glyph.length; i += 4) {
      ctx.moveTo(cx + glyph[i], cy + glyph[i + 1]);
      ctx.lineTo(cx + glyph[i + 2], cy + glyph[i + 3]);
    }
  }
  diagrams.diskPath(cx, cy, r, ctx);
  switch (mode) {
    case normalMode:
    case printMode:
      ctx.lineWidth = 0.25;
      switch (state.type) {
        case 'start':
          ctx.fillStyle = theme.strokeColor;
          ctx.fill();
          ctx.stroke();
          break;
        case 'stop':
          ctx.fillStyle = theme.bgColor;
          ctx.fill();
          ctx.stroke();
          diagrams.diskPath(cx, cy, r / 2, ctx);
          ctx.fillStyle = theme.strokeColor;
          ctx.fill();
          break;
        case 'history':
          ctx.fillStyle = theme.bgColor;
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          drawGlyph(theme.HGlyph, cx, cy);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.lineWidth = 0.25;
          break;
        case 'history*':
          ctx.fillStyle = theme.bgColor;
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          drawGlyph(theme.HGlyph, cx - r / 3, cy);
          drawGlyph(theme.StarGlyph, cx + r / 2, cy);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.lineWidth = 0.25;
          break;
      }
      break;
    case highlightMode:
      ctx.strokeStyle = theme.highlightColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    case hotTrackMode:
      ctx.strokeStyle = theme.hotTrackColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
  if (mode !== printMode && !isStopState(state)) {
    drawArrow(this, x + 2 * r + theme.arrowSize, y + r);
  }
}

Renderer.prototype.hitTestPseudoState = function(state, p, tol, mode) {
  const theme = this.theme,
        r = theme.radius,
        rect = this.getItemRect(state),
        x = rect.x, y = rect.y;
  if (mode !== printMode && !isStopState(state) && hitTestArrow(this, x + 2 * r + theme.arrowSize, y + r, p, tol))
    return { arrow: true };

  return diagrams.hitTestDisk(x + r, y + r, r, p, tol);
}

Renderer.prototype.drawStatechart = function(statechart, mode) {
  switch (mode) {
    case normalMode:
    case printMode:
    case highlightMode:
      break;
    case hotTrackMode:
      const ctx = this.ctx, theme = this.theme, r = theme.radius,
            rect = this.getItemRect(statechart),
            x = rect.x, y = rect.y, w = rect.width, h = rect.height;
      diagrams.roundRectPath(x, y, w, h, r, ctx);
      ctx.strokeStyle = theme.hotTrackColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
}

Renderer.prototype.hitTestStatechart = function(statechart, p, tol, mode) {
  const theme = this.theme,
        r = theme.radius,
        rect = this.getItemRect(statechart),
        x = rect.x, y = rect.y, w = rect.width, h = rect.height;
  return diagrams.hitTestRect(x, y, w, h, p, tol); // TODO hitTestRoundRect
}

Renderer.prototype.drawTransition = function(transition, mode) {
  const ctx = this.ctx,
        theme = this.theme,
        r = theme.knobbyRadius,
        bezier = transition[_bezier];
  diagrams.bezierEdgePath(bezier, ctx, theme.arrowSize);
  switch (mode) {
    case normalMode:
    case printMode:
      ctx.strokeStyle = theme.strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (mode !== printMode) {
        const pt = transition[_textT],
              r = theme.radius / 2;
        diagrams.roundRectPath(pt.x - r,
                               pt.y - r,
                               theme.radius, theme.radius, r, ctx);
        ctx.fillStyle = theme.bgColor;
        ctx.fill();
        ctx.lineWidth = 0.25;
        ctx.stroke();
        ctx.fillStyle = theme.textColor;
        ctx.fillText(transition[_text], pt.x + theme.padding, pt.y + theme.fontSize);
      }
      break;
    case highlightMode:
      ctx.strokeStyle = theme.highlightColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    case hotTrackMode:
      ctx.strokeStyle = theme.hotTrackColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
}

Renderer.prototype.hitTestTransition = function(transition, p, tol, mode) {
  return diagrams.hitTestBezier(transition[_bezier], p, tol);
}

Renderer.prototype.draw = function(item, mode) {
  switch (item.type) {
    case 'state':
      this.drawState(item, mode);
      break;
    case 'start':
    case 'stop':
    case 'history':
    case 'history*':
      this.drawPseudoState(item, mode);
      break;
    case 'transition':
      this.drawTransition(item, mode);
      break;
    case 'statechart':
      this.drawStatechart(item, mode);
      break;
  }
}

Renderer.prototype.hitTest = function(item, p, tol, mode) {
  let hitInfo;
  switch (item.type) {
    case 'state':
      hitInfo = this.hitTestState(item, p, tol, mode);
      break;
    case 'start':
    case 'stop':
    case 'history':
    case 'history*':
      hitInfo = this.hitTestPseudoState(item, p, tol, mode);
      break;
    case 'transition':
      hitInfo = this.hitTestTransition(item, p, tol, mode);
      break;
    case 'statechart':
      hitInfo = this.hitTestStatechart(item, p, tol, mode);
      break;
  }
  if (hitInfo)
    hitInfo.item = item;
  return hitInfo;
}

Renderer.prototype.drawHoverText = function(item, p) {
  const self = this, theme = this.theme, ctx = this.ctx,
        props = [];
  this.model.dataModel.visitProperties(item, function(item, attr) {
    const value = item[attr];
    if (Array.isArray(value))
      return;
    props.push({ name: attr, value: value });
  });
  const textSize = theme.fontSize, gap = 16, border = 4,
        height = textSize * props.length + 2 * border,
        maxWidth = diagrams.measureNameValuePairs(props, gap, ctx) + 2 * border;
  let x = p.x, y = p.y;
  ctx.fillStyle = theme.hoverColor;
  ctx.fillRect(x, y, maxWidth, height);
  ctx.fillStyle = theme.hoverTextColor;
  props.forEach(function(prop) {
    ctx.textAlign = 'left';
    ctx.fillText(prop.name, x + border, y + textSize);
    ctx.textAlign = 'right';
    ctx.fillText(prop.value, x + maxWidth - border, y + textSize);
    y += textSize;
  });
}

//------------------------------------------------------------------------------

function Editor(model, theme, canvasController, paletteController, propertyGridController) {
  const self = this;
  this.model = model;
  const statechart = model.root;
  this.statechart = statechart;
  this.canvasController = canvasController;
  this.canvas = canvasController.canvas;
  this.ctx = canvasController.ctx;
  this.paletteController = paletteController;
  this.paletteCanvas = paletteController.canvas;
  this.paletteCtx = paletteController.ctx;
  this.propertyGridController = propertyGridController;

  theme = extendTheme(theme);
  this.theme = theme;

  this.hitTolerance = 8;

  // Change tracking for layout.
  // Changed items that must be updated before drawing and hit testing.
  this.changedItems_ = new Set();
  // Changed top level states that must be updated during transactions and undo/redo.
  this.changedTopLevelStates_ = new Set();

  statechartModel.extend(model);
  editingModel.extend(model);

  const renderer = new Renderer(model, theme);
  this.renderer = renderer;

  model.dataModel.initialize();

  // Set up convenience functions.
  this.getTransitionSrc = model.referencingModel.getReferenceFn('srcId');
  this.getTransitionDst = model.referencingModel.getReferenceFn('dstId');

  // On attribute changes and item insertions, dynamically layout affected items.
  // This allows us to layout transitions as their src or dst states are dragged.
  model.observableModel.addHandler('changed', change => self.onChanged_(change));

  // On ending transactions and undo/redo, layout the changed top level states.
  function updateBounds() {
    self.updateBounds_();
  }
  model.transactionModel.addHandler('transactionEnding', updateBounds);
  model.transactionModel.addHandler('didUndo', updateBounds);
  model.transactionModel.addHandler('didRedo', updateBounds);

  // Embed the palette items in a statechart so the renderer can do layout and drawing.
  this.palette = {
    'type': 'statechart',
    'x': 0,
    'y': 0,
    'width': 0,
    'height': 0,
    'items': [
      {
        type: 'start',
        x: 8,
        y: 8,
      },
      {
        type: 'stop',
        x: 40,
        y: 8,
      },
      {
        type: 'history',
        x: 72,
        y: 8,
      },
      {
        type: 'history*',
        x: 104,
        y: 8,
      },
      {
        type: 'state',
        x: 8,
        y: 30,
        width: 100,
        height: 60,
        name: 'New State',
      },
    ],
  }

  // Register property grid layouts.
  function getAttr(info) {
    switch (info.label) {
      case 'name':
        return 'name';
      case 'entry':
        return 'entry';
      case 'exit':
        return 'exit';
      case 'event':
        return 'event';
      case 'guard':
        return 'guard';
      case 'action':
        return 'action';
    }
  }
  function getter(info, item) {
    const attr = getAttr(info);
    if (!item) return '';
    return item[attr] || '';
  }
  function setter(info, item, value) {
    const model = self.model,
          canvasController = self.canvasController;
    if (!item) return;
    const attr = getAttr(info),
          description = 'change ' + attr;
    model.transactionModel.beginTransaction(description);
    model.observableModel.changeValue(item, attr, value);
    model.transactionModel.endTransaction();
    canvasController.draw();
  }
  propertyGridController.register('state',
    [
      {
        label: 'name',
        type: 'text',
        getter: getter,
        setter: setter,
      },
      {
        label: 'entry',
        type: 'text',
        getter: getter,
        setter: setter,
      },
      {
        label: 'exit',
        type: 'text',
        getter: getter,
        setter: setter,
      },
    ]);
  propertyGridController.register('transition',
  [
    {
      label: 'event',
      type: 'text',
      getter: getter,
      setter: setter,
  },
    {
      label: 'guard',
      type: 'text',
      getter: getter,
      setter: setter,
  },
    {
      label: 'action',
      type: 'text',
      getter: getter,
      setter: setter,
  },
  ]);
}

Editor.prototype.initialize = function(canvasController) {
  const renderer = this.renderer;
  // Layout everything in the palette and statechart.
  renderer.begin(this.ctx);
  reverseVisitItem(this.statechart, item => renderer.layout(item));
  // Layout the palette items and their parent statechart.
  reverseVisitItem(this.palette, item => renderer.layout(item));
  // Draw the palette items.
  visitItems(this.palette.items, item => renderer.draw(item));
  renderer.end();
}

Editor.prototype.updateLayout_ = function() {
  const renderer = this.renderer,
        changedItems = this.changedItems_;
  // First layout containers, and then layout transitions which depend on states'
  // size and location.
  // This function is called during the draw and updateBounds_ methods, so the renderer
  // is already started.
  function layout(item) {
    reverseVisitItem(item, item => renderer.layout(item));
  }
  changedItems.forEach(
    item => { if (!isTransition(item)) layout(item); });
  changedItems.forEach(
    item => { if (isTransition(item)) layout(item); });
  changedItems.clear();
}

Editor.prototype.updateBounds_ = function() {
  const ctx = this.ctx,
        renderer = this.renderer,
        statechart = this.statechart,
        changedTopLevelStates = this.changedTopLevelStates_;
  renderer.begin(ctx);
  // Update any changed items first.
  this.updateLayout_();
  changedTopLevelStates.forEach(
    state => reverseVisitItem(state, item => renderer.layout(item), isStateOrStatechart));
  // Finally update the root statechart's bounds.
  renderer.layoutStatechart(statechart);
  renderer.end();
  changedTopLevelStates.clear();
  // Make sure the canvas is large enough to contain the root statechart.
  const canvasController = this.canvasController,
        canvasSize = canvasController.getSize();
  let width = statechart.width,
      height = statechart.height;
  if (width > canvasSize.width || height > canvasSize.height) {
    width = Math.max(width, canvasSize.width);
    height = Math.max(height, canvasSize.height);
    canvasController.setSize(width, height);
  }
}

Editor.prototype.onChanged_ = function(change) {
  const statechart = this.statechart,
        statechartModel = this.model.statechartModel,
        hierarchicalModel = this.model.hierarchicalModel,
        changedItems = this.changedItems_,
        changedTopLevelStates = this.changedTopLevelStates_,
        item = change.item,
        attr = change.attr;

  // Track all top level states which contain changes. On ending a transaction,
  // update the layout of states and statecharts.
  let ancestor = change.item,
      topLevel = ancestor;
  do {
    topLevel = ancestor;
    ancestor = hierarchicalModel.getParent(ancestor);
  } while (ancestor && ancestor !== statechart);

  if (ancestor === statechart) {
    assert(topLevel);
    changedTopLevelStates.add(topLevel);
  }

  function addItems(item) {
    if (isState(item)) {
      // Layout the state's incoming and outgoing transitions.
      statechartModel.forInTransitions(item, addItems);
      statechartModel.forOutTransitions(item, addItems);
    }
    changedItems.add(item);
  }

  switch (change.type) {
    case 'change': {
      // For changes to x, y, width, or height, layout affected transitions.
      if (attr == 'x' || attr == 'y' || attr == 'width' || attr == 'height') {
        // Visit item and sub-items to layout all affected transitions.
        visitItem(item, addItems);
      } else if (isTransition(item)) {
        addItems(item);
      }
      break;
    }
    case 'insert': {
      // Update item subtrees as they are inserted.
      reverseVisitItem(item[attr][change.index], addItems);
      break;
    }
  }
}

Editor.prototype.draw = function(canvasController) {
  const renderer = this.renderer, statechart = this.statechart,
        model = this.model;
  if (canvasController === this.canvasController) {
    const ctx = this.ctx;
    renderer.begin(ctx);
    this.updateLayout_();
    canvasController.applyTransform();

    visitItem(statechart, function(item) {
      renderer.draw(item, normalMode);
    }, isNonTransition);
    visitItem(statechart, function(transition) {
      renderer.draw(transition, normalMode);
    }, isTransition);

    model.selectionModel.forEach(function(item) {
      renderer.draw(item, highlightMode);
    });
    if (this.hotTrackInfo)
      renderer.draw(this.hotTrackInfo.item, hotTrackMode);

    const hoverHitInfo = this.hoverHitInfo;
    if (hoverHitInfo) {
      renderer.drawHoverText(hoverHitInfo.item, hoverHitInfo.p);
    }
    renderer.end();
  } else if (canvasController === this.paletteController) {
    // Palette drawing occurs during drag and drop. If the palette has the drag,
    // draw the canvas underneath so the new object will appear on the canvas.
    this.canvasController.draw();
    const ctx = this.paletteCtx;
    renderer.begin(ctx);
    canvasController.applyTransform();
    visitItems(this.palette.items, function(item) {
      renderer.draw(item, printMode);
    });
    // Draw the new object in the palette. Translate object to palette coordinates.
    const offset = canvasController.offsetToOtherCanvas(this.paletteController);
    ctx.translate(offset.x, offset.y);
    model.selectionModel.forEach(function(item) {
      renderer.draw(item, normalMode);
      renderer.draw(item, highlightMode);
    });
    renderer.end();
  }
}

Editor.prototype.print = function() {
  const renderer = this.renderer,
        statechart = this.statechart,
        model = this.model,
        selectionModel = model.selectionModel,
        editingModel = model.editingModel,
        canvasController = this.canvasController;

  // Calculate document bounds.
  const states = new Array();
  visitItems(statechart.items, function(item) {
    states.push(item);
  }, isNonTransition);

  const bounds = renderer.getBounds(states);
  const ctx = new C2S(bounds.width, bounds.height);
  ctx.translate(-bounds.x, -bounds.y);

  renderer.begin(ctx);
  // We shouldn't need to layout any changed items here.
  assert(!this.changedItems_.size);
  canvasController.applyTransform();

  visitItems(statechart.items, function(item) {
    renderer.draw(item, printMode);
  }, isNonTransition);
  visitItems(statechart.items, function(transition) {
    renderer.draw(transition, printMode);
  }, isTransition);

  renderer.end();

  // Write out the SVG file.
  const serializedSVG = ctx.getSerializedSvg();
  const blob = new Blob([serializedSVG], {
    type: 'text/plain'
  });
  saveAs(blob, 'statechart.svg', true);
}

Editor.prototype.getCanvasPosition = function(canvasController, p) {
  // TODO make this simplification.
  // return this.paletteController.viewToOtherCanvasView(canvasController, p);
  const cp = canvasController.viewToCanvas(p);
  if (canvasController == this.canvasController) {
    return cp;
  } else {
    assert(canvasController === this.paletteController);
    const offset = canvasController.offsetToOtherCanvas(this.canvasController);
    return { x: cp.x - offset.x, y: cp.y - offset.y };
  }
}

Editor.prototype.hitTest = function(canvasController, p) {
  const renderer = this.renderer,
        tol = this.hitTolerance,
        statechart = this.statechart,
        cp = this.getCanvasPosition(canvasController, p),
        ctx = canvasController.getCtx(),
        hitList = [];
  function pushInfo(info) {
    if (info)
      hitList.push(info);
  }
  renderer.begin(ctx);
  this.updateLayout_();
  // TODO hit test selection first, in highlight, first.
  // Skip the root statechart, as hits there should go to the underlying canvas controller.
  reverseVisitItems(statechart.items, function(transition) {
    pushInfo(renderer.hitTest(transition, cp, tol, normalMode));
  }, isTransition);
  reverseVisitItems(statechart.items, function(item) {
    pushInfo(renderer.hitTest(item, cp, tol, normalMode));
  }, isNonTransition);
  renderer.end();
  return hitList;
}

Editor.prototype.hitTestPalette = function(canvasController, p) {
  const renderer = this.renderer,
        tol = this.hitTolerance,
        ctx = canvasController.getCtx(),
        hitList = [];
  function pushInfo(info) {
    if (info)
      hitList.push(info);
  }
  renderer.begin(ctx);
  reverseVisitItems(this.palette.items, function(item) {
    pushInfo(renderer.hitTest(item, p, tol, printMode));
  }, isNonTransition);
  renderer.end();
  return hitList;
}

Editor.prototype.getFirstHit = function(hitList, filterFn) {
  if (hitList) {
    const model = this.model;
    for (let hitInfo of hitList) {
      if (filterFn(hitInfo, model))
        return hitInfo;
    }
  }
  return null;
}

function isStateBorder(hitInfo, model) {
  return isState(hitInfo.item) && hitInfo.border;
}

function isDraggable(hitInfo, model) {
  return !isStatechart(hitInfo.item);
}

function isStateDropTarget(hitInfo, model) {
  const item = hitInfo.item;
  return isTrueStateOrStatechart(item) &&
         !model.hierarchicalModel.isItemInSelection(item);
}

Editor.prototype.setPropertyGrid = function() {
  const model = this.model,
        item = model.selectionModel.lastSelected(),
        type = item ? item.type : undefined;
  this.propertyGridController.show(type, item);
}

Editor.prototype.onClick = function(canvasController, alt) {
  const model = this.model,
        selectionModel = model.selectionModel,
        shiftKeyDown = this.canvasController.shiftKeyDown,
        cmdKeyDown = this.canvasController.cmdKeyDown,
        p = canvasController.getInitialPointerPosition(),
        cp = canvasController.viewToCanvas(p);
  let hitList;
  if (canvasController === this.paletteController) {
    // Hit test the palette on top of the canvas.
    hitList = this.hitTestPalette(canvasController, cp);
  } else {
    assert(canvasController === this.canvasController);
    hitList = this.hitTest(canvasController, cp);
  }
  const mouseHitInfo = this.mouseHitInfo = this.getFirstHit(hitList, isDraggable);
  if (mouseHitInfo) {
    const item = mouseHitInfo.item,
          inPalette = canvasController === this.paletteController;
    if (inPalette) {
      mouseHitInfo.inPalette = true;
      selectionModel.clear();
      // this.paletteController.transferPointer(this.canvasController);
    } else if (cmdKeyDown) {
      mouseHitInfo.moveCopy = true;
      selectionModel.select(item);
    } else {
      selectionModel.select(item, shiftKeyDown);
    }
  } else {
    if (!shiftKeyDown) {
      selectionModel.clear();
    }
  }
  this.setPropertyGrid();
  return mouseHitInfo !== null;
}

const connectTransitionSrc = 1,
      connectTransitionDst = 2,
      copyPaletteItem = 3,
      moveSelection = 4,
      moveCopySelection = 5,
      resizeState = 6,
      moveTransitionPoint = 7;

Editor.prototype.onBeginDrag = function(canvasController) {
  const mouseHitInfo = this.mouseHitInfo;
  if (!mouseHitInfo)
    return false;
  const model = this.model,
        editingModel = model.editingModel,
        selectionModel = model.selectionModel,
        dragItem = mouseHitInfo.item,
        p0 = canvasController.getInitialPointerPosition();
  let drag, newTransition;
  if (mouseHitInfo.arrow) {
    const stateId = model.dataModel.getId(dragItem),
          cp0 = this.getCanvasPosition(canvasController, p0);
    // Start the new transition as connecting the src state to itself.
    newTransition = {
      type: 'transition',
      srcId: stateId,
      t1: 0,
      [_p2]: cp0,
      pt: 0.5,  // initial property attachment at midpoint.
    };
    drag = {
      type: connectTransitionDst,
      name: 'Add new transition',
      newItem: true,
    };
  } else {
    switch (dragItem.type) {
      case 'state':
      case 'start':
      case 'stop':
      case 'history':
      case 'history*':
        if (mouseHitInfo.inPalette) {
          drag = {
            type: copyPaletteItem,
            name: 'Add palette item',
            items: [dragItem],
            newItem: true
          };
        } else if (mouseHitInfo.moveCopy) {
          drag = {
            type: moveCopySelection,
            name: 'Move copy of selection',
            items: selectionModel.contents(),
            newItem: true
          };
        } else {
          if (dragItem.type === 'state' && mouseHitInfo.border) {
            drag = {
              type: resizeState,
              name: 'Resize state',
            };
          } else {
            drag = {
              type: moveSelection,
              name: 'Move selection',
              };
          }
        }
        break;
      case 'transition':
        if (mouseHitInfo.p1)
          drag = {
            type: connectTransitionSrc,
            name: 'Edit transition'
          };
        else if (mouseHitInfo.p2)
          drag = {
            type: connectTransitionDst,
            name: 'Edit transition'
          };
        else {
          drag = {
            type: moveTransitionPoint,
            name: 'Drag transition attachment point'
          };
        }
        break;
    }
    drag.item = dragItem;
}

  this.drag = drag;
  if (drag) {
    if (drag.type === moveSelection || drag.type === moveCopySelection) {
      editingModel.reduceSelection();
      // let items = selectionModel.contents();
      // drag.isSingleElement = items.length === 1 && isState(items[0]);
    }
    model.transactionModel.beginTransaction(drag.name);
    if (newTransition) {
      drag.item = newTransition;
      editingModel.newItem(newTransition);
      editingModel.addItem(newTransition, this.statechart);
      selectionModel.set(newTransition);
    } else {
      if (drag.type == copyPaletteItem || drag.type == moveCopySelection) {
        const map = new Map(),
              copies = editingModel.copyItems(drag.items, map);
        // Transform palette items into the canvas coordinate system.
        if (drag.type == copyPaletteItem) {
          const offset = this.paletteController.offsetToOtherCanvas(this.canvasController);
          copies.forEach(function transform(item) {
            item.x -= offset.x; item.y -= offset.y;
          });
          }
        editingModel.addItems(copies);
        selectionModel.set(copies);
      }
    }
  }
}

Editor.prototype.onDrag = function(canvasController) {
  const drag = this.drag;
  if (!drag)
    return;
  const dragItem = drag.item,
        model = this.model,
        dataModel = model.dataModel,
        observableModel = model.observableModel,
        transactionModel = model.transactionModel,
        referencingModel = model.referencingModel,
        selectionModel = model.selectionModel,
        editingModel = model.editingModel,
        renderer = this.renderer,
        p0 = canvasController.getInitialPointerPosition(),
        cp0 = this.getCanvasPosition(canvasController, p0),
        p = canvasController.getCurrentPointerPosition(),
        cp = this.getCanvasPosition(canvasController, p),
        dx = cp.x - cp0.x, dy = cp.y - cp0.y,
        mouseHitInfo = this.mouseHitInfo,
        snapshot = transactionModel.getSnapshot(dragItem),
        hitList = this.hitTest(canvasController, p);
  let hitInfo;
  switch (drag.type) {
    case copyPaletteItem:
    case moveCopySelection:
    case moveSelection:
      hitInfo = this.getFirstHit(hitList, isStateDropTarget);
      selectionModel.forEach(function(item) {
        const snapshot = transactionModel.getSnapshot(item);
        if (snapshot && isNonTransition(item)) {
          observableModel.changeValue(item, 'x', snapshot.x + dx);
          observableModel.changeValue(item, 'y', snapshot.y + dy);
        }
      });
      break;
    case resizeState:
      if (mouseHitInfo.left) {
        observableModel.changeValue(dragItem, 'x', snapshot.x + dx);
        observableModel.changeValue(dragItem, 'width', snapshot.width - dx);
      }
      if (mouseHitInfo.top) {
        observableModel.changeValue(dragItem, 'y', snapshot.y + dy);
        observableModel.changeValue(dragItem, 'height', snapshot.height - dy);
      }
      if (mouseHitInfo.right)
        observableModel.changeValue(dragItem, 'width', snapshot.width + dx);
      if (mouseHitInfo.bottom)
        observableModel.changeValue(dragItem, 'height', snapshot.height + dy);
      break;
    case connectTransitionSrc: {
      const dst = referencingModel.getReference(dragItem, 'dstId');
      hitInfo = this.getFirstHit(hitList, isStateBorder);
      const srcId = hitInfo ? dataModel.getId(hitInfo.item) : 0;  // 0 is invalid id
      if (srcId && editingModel.isValidTransition(hitInfo.item, dst)) {
        observableModel.changeValue(dragItem, 'srcId', srcId);
        const src = referencingModel.getReference(dragItem, 'srcId'),
              t1 = renderer.statePointToParam(src, cp);
        observableModel.changeValue(dragItem, 't1', t1);
      } else {
        observableModel.changeValue(dragItem, 'srcId', 0);
        // Change private property through model to update observers.
        observableModel.changeValue(dragItem, _p1, cp);
      }
      break;
    }
    case connectTransitionDst: {
      const src = referencingModel.getReference(dragItem, 'srcId');
      // Adjust position on src state to track the new transition.
      if (drag.newItem) {
        observableModel.changeValue(dragItem, 't1', renderer.statePointToParam(src, cp));
      }
      hitInfo = this.getFirstHit(hitList, isStateBorder);
      const dstId = hitInfo ? dataModel.getId(hitInfo.item) : 0;  // 0 is invalid id
      if (dstId && editingModel.isValidTransition(src, hitInfo.item)) {
        observableModel.changeValue(dragItem, 'dstId', dstId);
        const dst = referencingModel.getReference(dragItem, 'dstId'),
              t2 = renderer.statePointToParam(dst, cp);
        observableModel.changeValue(dragItem, 't2', t2);
      } else {
        observableModel.changeValue(dragItem, 'dstId', 0);
        // Change private property through model to update observers.
        observableModel.changeValue(dragItem, _p2, cp);
      }
      break;
    }
    case moveTransitionPoint: {
      hitInfo = this.renderer.hitTest(dragItem, cp, this.hitTolerance, normalMode);
      if (hitInfo)
        observableModel.changeValue(dragItem, 'pt', hitInfo.t);
      else
        observableModel.changeValue(dragItem, 'pt', snapshot.pt);
      break;
    }
  }

  this.hotTrackInfo = (hitInfo && hitInfo.item !== this.statechart) ? hitInfo : null;
}

Editor.prototype.onEndDrag = function(canvasController) {
  const drag = this.drag;
  if (!drag)
    return;
  const model = this.model,
        statechart = this.statechart,
        selectionModel = model.selectionModel,
        transactionModel = model.transactionModel,
        editingModel = model.editingModel,
        p = canvasController.getCurrentPointerPosition(),
        dragItem = drag.item;
  if (isTransition(dragItem)) {
    dragItem[_p1] = dragItem[_p2] = undefined;
  } else if (drag.type == copyPaletteItem || drag.type === moveSelection ||
             drag.type === moveCopySelection) {
    // Find state beneath mouse.
    const hitList = this.hitTest(canvasController, p),
          hitInfo = this.getFirstHit(hitList, isStateDropTarget),
          parent = hitInfo ? hitInfo.item : statechart;
    // Reparent items.
    selectionModel.contents().forEach(function(item) {
      editingModel.addItem(item, parent);
    });
  }

  if (editingModel.isValidStatechart(statechart)) {
    transactionModel.endTransaction();
  } else {
    transactionModel.cancelTransaction();
  }

  this.setPropertyGrid();

  this.drag = null;
  this.mouseHitInfo = null;
  this.hotTrackInfo = null;
  this.mouseHitInfo = null;

  this.canvasController.draw();
}

Editor.prototype.onBeginHover = function(canvasController) {
  const model = this.model,
        p = canvasController.getCurrentPointerPosition(),
        hitList = this.hitTest(canvasController, p),
        hoverHitInfo = this.getFirstHit(hitList, isDraggable);
  if (!hoverHitInfo)
    return false;
  const cp = canvasController.viewToCanvas(p);

  hoverHitInfo.p = cp;
  this.hoverHitInfo = hoverHitInfo;
  return true;
}

Editor.prototype.onEndHover = function(canvasController) {
  if (this.hoverHitInfo)
    this.hoverHitInfo = null;
}

Editor.prototype.onKeyDown = function(e) {
  const model = this.model,
        statechart = this.statechart,
        renderer = model.renderer,
        selectionModel = model.selectionModel,
        editingModel = model.editingModel,
        transactionHistory = model.transactionHistory,
        keyCode = e.keyCode,
        cmdKey = e.ctrlKey || e.metaKey,
        shiftKey = e.shiftKey;

  if (keyCode === 8) {  // 'delete'
    editingModel.doDelete();
    return true;
  }
  if (cmdKey) {
    switch (keyCode) {
      case 65:  // 'a'
        statechart.items.forEach(function(v) {
          selectionModel.add(v);
        });
        return true;
      case 90:  // 'z'
        if (transactionHistory.getUndo()) {
          selectionModel.clear();
          transactionHistory.undo();
          return true;
        }
        return false;
      case 89:  // 'y'
        if (transactionHistory.getRedo()) {
          selectionModel.clear();
          transactionHistory.redo();
          return true;
        }
        return false;
      case 88:  // 'x'
        editingModel.doCut();
        return true;
      case 67:  // 'c'
        editingModel.doCopy();
        return true;
      case 86:  // 'v'
        if (model.copyPasteModel.getScrap()) {
          editingModel.doPaste();
          return true;
        }
        return false;
      case 69:  // 'e'
        editingModel.doSelectConnectedStates(!shiftKey);
        return true;
      case 72:  // 'h'
        editingModel.doTogglePalette();
        return true;
      case 83:  // 's'
        // var text = JSON.stringify(
        //   statechart,
        //   function(key, value) {
        //     if (key.toString().charAt(0) === '_')
        //       return;
        //     if (value === undefined || value === null)
        //       return;
        //     return value;
        //   },
        //   2);
        // // Writes statechart as JSON to console.
        // console.log(text);

        // var ctx = new canvas2pdf.PdfContext(blobStream());
        // this.print(ctx);
        // // //draw your canvas like you would normally
        // // ctx.fillStyle='yellow';
        // // ctx.fillRect(100,100,100,100);
        // // // more canvas drawing, etc...

        // //convert your PDF to a Blob and save to file
        // ctx.stream.on('finish', function () {
        //     var blob = ctx.stream.toBlob('application/pdf');
        //     saveAs(blob, 'example.pdf', true);
        // });
        // ctx.end();

        {
          this.print();
          return true;
        }
    }
  }
}

return {
  editingModel: editingModel,
  statechartModel: statechartModel,

  Renderer: Renderer,
  Editor: Editor,
};
})();


const statechart_data = {
  'type': 'statechart',
  'id': 1001,
  'x': 0,
  'y': 0,
  'width': 0,
  'height': 0,
  'name': 'Example',
  'items': [],
}
