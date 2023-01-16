# Introduction
JSStatecharts implements a graphical editor for Statecharts. It aims to support most Statechart
features with a simple, minimal user interface.

# Statecharts
[Statecharts: a visual formalism for complex systems](https://www.sciencedirect.com/science/article/pii/0167642387900359) were invented by David Harel as a visual formalism for state machines. With states and transitions between them, Statecharts resemble finite state machines, but introduce two key new concepts.

1. States are hierarchical, so that a Statechart may be contained in a parent state. A transition
from the parent state represents a transition from every contained state, which is a key abstraction
mechanism, and greatly reduces the number of transitions needed in the diagram.

2. States may alsocontain multiple orthogonal Statecharts, which conceptually execute in parallel. This is
the other abstraction mechanism, creating a product space of possible configurations, and greatly reduces
the number of states  in the system.

# Getting Started

At the top left of the canvas area, a floating palette contains the states and pseudostates needed to create
a statechart. Palette items can be clicked on and dragged onto the canvas area.
<figure>
  <img src="/resources/palette.svg"  alt="" title="Primitive elements (literal and functions)">
</figure>

There are rules for pseudostates, principally that the solid black 'start' pseudostate must be unique in
a statechart, as there can be only one starting state. Dragging another start state into a statechart is immediately undone by the editor.

States and pseudostates on the canvas have an arrow shaped transition handle at their top right. These can be
dragged and connected to other states, and even to the originating state for a "self transition". Note that
transitions have an arrow indicating the direction from source to destination. As with pseudostates, there
are some restrictions on transitions involving pseudostates. A 'start' pseudostate can only be the source of
a transition, while an 'end' pseudostate can only be the destination of a transition.

# Selection

TBD selecting states and transitions

# Property Editing

# Making a State a SuperState

States can be dragged and dropped onto other states.







