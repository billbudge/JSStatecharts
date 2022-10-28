// Statechart unit tests

const statechartTests = (function () {
  'use strict';
  
  function newStatechart() {
    return {
      root: {  // dataModels default is model.root for data.
        type: 'statechart',
        x: 0,
        y: 0,
        items: []
      }
    };
  }
  
  let id = 1;
  function newState(x, y) {
    return {
      type: "state",
      id: id++,
      x: x || 0,
      y: y || 0,
    };
  }
  
  function newPseudoState(type, x, y) {
    return {
      type: type,
      x: x || 0,
      y: y || 0,
    };
  }
  
  function getId(item) {
    return item.id;
  }
  
  function newTransition(src, dst) {
    return {
      type: 'transition',
      srcId: getId(src),
      dstId: getId(dst),
    }
  }
  
  function addState(test, state) {
    const model = test.model,
          dataModel = model.dataModel,
          hierarchicalModel = model.hierarchicalModel,
          observableModel = model.observableModel,
          parent = dataModel.root;
    dataModel.assignId(state);
    dataModel.initialize(state);
    observableModel.insertElement(parent, 'items', parent.items.length, state);
    return state;
  }
  
  function addTransition(test, transition) {
    const model = test.model,
          observableModel = model.observableModel,
          parent = model.dataModel.root;
    observableModel.insertElement(parent, 'items', parent.items.length, transition);
    return transition;
  }
  
  function newTestStatechartModel() {
    let statechart = newStatechart();
    let test = statecharts.statechartModel.extend(statechart),
        dataModel = test.model.dataModel;
    statechart.dataModel.initialize();
    return test;
  }
  
  function newTestEditingModel() {
    let statechart = newStatechart();
    let test = statecharts.editingModel.extend(statechart),
        model = test.model;
    statecharts.statechartModel.extend(statechart);
    test.model.dataModel.initialize();
  
    // Context sufficient for tests.
    const ctx = {
      measureText: () => { return { width: 10, height: 10 }},
      save: () => {},
    };
    model.renderer = new statecharts.Renderer(model);
    model.renderer.begin(ctx);
    return test;
  }
  
  QUnit.test("statecharts.statechartModel.extend", function() {
    let test = newTestStatechartModel();
    QUnit.assert.ok(test);
    QUnit.assert.ok(test.model);
    QUnit.assert.ok(test.model.referencingModel);
  });
  
  QUnit.test("statecharts.statechartModel.extend", function() {
    let test = newTestStatechartModel();
    QUnit.assert.ok(test);
    QUnit.assert.ok(test.model);
    QUnit.assert.ok(test.model.referencingModel);
  });
  
  QUnit.test("statecharts.statechartModel.getGraphInfo", function() {
    const test = newTestStatechartModel(),
          model = test.model,
          items = model.root.items,
          state1 = addState(test, newState()),
          state2 = addState(test, newState()),
          transition1 = addTransition(test, newTransition(state1, state2));
    let graph;
  
    graph = test.getGraphInfo([state1, state2]);
    QUnit.assert.ok(graph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(graph.statesAndStatecharts.has(state2));
    QUnit.assert.deepEqual(graph.statesAndStatecharts.size, 3);
    QUnit.assert.deepEqual(graph.transitions.size, 1);
    QUnit.assert.ok(graph.interiorTransitions.has(transition1));
    QUnit.assert.deepEqual(graph.interiorTransitions.size, 1);
    QUnit.assert.deepEqual(graph.inTransitions.size, 0);
    QUnit.assert.deepEqual(graph.outTransitions.size, 0);
  
    const input = addState(test, newState()),
          output = addState(test, newState()),
          transition2 = addTransition(test, newTransition(input, state1)),
          transition3 = addTransition(test, newTransition(state2, output));
  
    graph = test.getGraphInfo();
    QUnit.assert.ok(graph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(graph.statesAndStatecharts.has(state2));
    QUnit.assert.ok(graph.statesAndStatecharts.has(input));
    QUnit.assert.ok(graph.statesAndStatecharts.has(output));
    QUnit.assert.deepEqual(graph.statesAndStatecharts.size, 5);
    QUnit.assert.ok(graph.interiorTransitions.has(transition1));
    QUnit.assert.ok(graph.interiorTransitions.has(transition2));
    QUnit.assert.ok(graph.interiorTransitions.has(transition3));
    QUnit.assert.deepEqual(graph.transitions.size, 3);
    QUnit.assert.deepEqual(graph.interiorTransitions.size, 3);
    QUnit.assert.deepEqual(graph.inTransitions.size, 0);
    QUnit.assert.deepEqual(graph.outTransitions.size, 0);
  });
  
  QUnit.test("statecharts.statechartModel.getSubgraphInfo", function() {
    const test = newTestStatechartModel(),
          model = test.model,
          items = model.root.items,
          state1 = addState(test, newState()),
          state2 = addState(test, newState()),
          transition1 = addTransition(test, newTransition(state1, state2));
    let subgraph;
  
    subgraph = test.getSubgraphInfo([state1, state2]);
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state2));
    QUnit.assert.deepEqual(subgraph.statesAndStatecharts.size, 2);
    QUnit.assert.ok(subgraph.interiorTransitions.has(transition1));
    QUnit.assert.deepEqual(subgraph.transitions.size, 1);
    QUnit.assert.deepEqual(subgraph.interiorTransitions.size, 1);
    QUnit.assert.deepEqual(subgraph.inTransitions.size, 0);
    QUnit.assert.deepEqual(subgraph.outTransitions.size, 0);
  
    const input = addState(test, newState()),
          output = addState(test, newState()),
          transition2 = addTransition(test, newTransition(input, state1)),
          transition3 = addTransition(test, newTransition(state2, output));
  
    subgraph = test.getSubgraphInfo([state1, state2]);
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state2));
    QUnit.assert.deepEqual(subgraph.statesAndStatecharts.size, 2);
    QUnit.assert.ok(subgraph.interiorTransitions.has(transition1));
    QUnit.assert.deepEqual(subgraph.transitions.size, 3);
    QUnit.assert.deepEqual(subgraph.interiorTransitions.size, 1);
    QUnit.assert.ok(subgraph.inTransitions.has(transition2));
    QUnit.assert.deepEqual(subgraph.inTransitions.size, 1);
    QUnit.assert.ok(subgraph.outTransitions.has(transition3));
    QUnit.assert.deepEqual(subgraph.outTransitions.size, 1);
  });
  
  function testIterator(fn, element, items) {
    const iterated = [];
    fn(element, (item) => iterated.push(item));
    QUnit.assert.deepEqual(items, iterated);
  }
  
  QUnit.test("statecharts.statechartModel.iterators", function() {
    const test = newTestStatechartModel(),
          model = test.model,
          items = model.root.items,
          state1 = addState(test, newState()),
          state2 = addState(test, newState()),
          transition1 = addTransition(test, newTransition(state1, state2)),
          input = addState(test, newState()),
          output = addState(test, newState()),
          transition2 = addTransition(test, newTransition(input, state1)),
          transition3 = addTransition(test, newTransition(input, state2)),
          transition4 = addTransition(test, newTransition(state2, output));
  
    const inputFn = test.forInTransitions.bind(test),
          outputFn = test.forOutTransitions.bind(test);
    testIterator(inputFn, input, []);
    testIterator(outputFn, input, [transition2, transition3]);
    testIterator(inputFn, state1, [transition2]);
    testIterator(outputFn, state1, [transition1]);
    testIterator(inputFn, state2, [transition1, transition3]);
    testIterator(outputFn, state2, [transition4]);
  });
  
  QUnit.test("statecharts.editingModel", function() {
    const test = newTestEditingModel(),
          model = test.model,
          statechart = model.root;
    QUnit.assert.ok(test);
    QUnit.assert.ok(model);
    QUnit.assert.ok(model.dataModel);
    QUnit.assert.ok(model.selectionModel);
  });
  
  function doInitialize(item) {
    item.initalized = true;
  }
  
  QUnit.test("statecharts.editingModel.newItem", function() {
    const test = newTestEditingModel(),
          model = test.model,
          statechart = model.root;
    model.dataModel.addInitializer(doInitialize);
    const item1 = newState();
    test.newItem(item1);
    QUnit.assert.ok(item1.id);
    QUnit.assert.ok(item1.initalized);
  });
  
  QUnit.test("statecharts.editingModel.addDeleteItem", function() {
    const test = newTestEditingModel(),
          model = test.model,
          statechart = model.root;
    // Add an item.
    const item1 = newState();
    test.newItem(item1);
    test.addItem(item1, model.root);
    QUnit.assert.deepEqual(model.root.items, [item1]);
    QUnit.assert.deepEqual(model.hierarchicalModel.getParent(item1), statechart);
    // Delete the item.
    test.deleteItem(item1);
    QUnit.assert.deepEqual(statechart.items, []);
  });
  
  QUnit.test("statecharts.editingModel.findChildStatechart", function() {
    let test = newTestEditingModel(),
        items = test.model.root.items,
        superState = addState(test, newState()),
        state = newState(),
        transition = newTransition(state, state),
        start = newPseudoState('start');
    // Primitive state has no statechart.
    QUnit.assert.ok(test.findChildStatechart(superState, state) === -1);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === -1);
    // Add a child statechart.
    const statechart1 = test.findOrCreateChildStatechart(superState, state);
    // Can add state.
    QUnit.assert.ok(test.findChildStatechart(superState, state) === 0);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === 0);
    statechart1.items.push(newState());
    QUnit.assert.ok(test.findChildStatechart(superState, state) === 0);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === 0);
    // Add a start state.
    statechart1.items.push(newPseudoState('start'));
    QUnit.assert.ok(test.findChildStatechart(superState, state) === 0);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === -1);
  });
  
  QUnit.test("statecharts.editingModel.transitionConsistency", function() {
    let test = newTestEditingModel(),
        items = test.model.root.items,
        state1 = addState(test, newState()),
        state2 = addState(test, newState()),
        transition = addTransition(test, newTransition(state1, state2));
  
    // Remove element and make sure dependent wire is also deleted.
    test.deleteItem(state1);
    test.makeConsistent();
    QUnit.assert.ok(!items.includes(transition));
  });
  
  })();
  