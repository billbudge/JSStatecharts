# Statecharts
JSStatecharts is a graphical editor for editing Harel Statecharts. It aims to support most Statechart
features with a simple, minimal user interface.

# Getting Started

Floating palette, canvas area.

## Floating Palette

TBD

## Canvas

TBD

<figure>
  <img src="/resources/palette.svg"  alt="" title="Primitive elements (literal and functions)">
</figure>

On the top row is the literal element, with no inputs and a single output. Literals can represent numbers, strings and other value types. Next are the unary and binary functions, and the only 3-ary function, the conditional operator.



Function closing is a powerful graph simplification mechanism. Imagine we wanted to apply our quadratic polynomial evaluation function to one polynomial at 4 different x values. Using the grouped expression 4 times leads to a complex graph that is becoming unwieldy. Applying the function to the polynomial coefficients and closing gives a simple unary function that we can apply 4 times, which is easier to understand.

<figure>
  <img src="/resources/function_creation2.png"  alt="" title="Function closing is a powerful graph simplification mechanism">
</figure>

## Iteration

Iteration can be challenging in a data flow system. Let's start with everyone's favorite toy example, the factorial function.


### Generic iteration

```js
let acc = 0;
for (let i = 0; i < n; i++) {
	acc += i;
}
return acc;
```


