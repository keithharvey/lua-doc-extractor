import dedent from "dedent-js";
import { testInput } from "./utility/harness";

testInput(
  "Generates function with params",
  dedent`
    /*** Called when a unit emits a seismic ping.
     *
     * @function UnitSeismicPing
     *
     * See \`seismicSignature\`.
     *
     * @param x number
     * @param y number
     * @param z number
     */
    `,
  dedent`
    ---Called when a unit emits a seismic ping.
    ---
    ---See \`seismicSignature\`.
    ---
    ---@param x number
    ---@param y number
    ---@param z number
    function UnitSeismicPing(x, y, z) end
  `
);

testInput(
  "Generic function",
  dedent`
    /***
     * Does foo.
     *
     * @function SomeTable.Foo
     *
     * @generic T : integer
     * @param x T
     * @param y integer
     */
    `,
  dedent`
    ---Does foo.
    ---
    ---@generic T : integer
    ---@param x T
    ---@param y integer
    function SomeTable.Foo(x, y) end
  `
);

testInput(
  "Method",
  dedent`
    /***
     * Does foo.
     *
     * @function SomeTable:Foo
     * @param x integer
     */
    `,
  dedent`
    ---Does foo.
    ---
    ---@param x integer
    function SomeTable:Foo(x) end
  `
);

testInput(
  "Variadic function param",
  dedent`
    /***
     * Does foo.
     *
     * @function variadic
     * @param name string
     * @param ... integer
     */
    `,
  dedent`
    ---Does foo.
    ---
    ---@param name string
    ---@param ... integer
    function variadic(name, ...) end
  `
);

testInput(
  "Nested table function",
  dedent`
    /***
     * @function Foo.Bar.baz
     */
    `,
  dedent`
    function Foo.Bar.baz() end
  `
);

testInput(
  "Nested table method",
  dedent`
    /***
     * @function Foo.Bar.baz
     */
    `,
  dedent`
    function Foo.Bar.baz() end
  `
);

testInput(
  "Variadic function return",
  dedent`
    /***
     * @function returner
     * @return integer ...
     */
    `,
  dedent`
    ---@return integer ...
    function returner() end
  `
);

testInput(
  "Multiple returns with union types containing literal keywords",
  dedent`
    /***
     * @function Spring.GetUnitMoveDefID
     *
     * Returns a numerical movedef ID and its name.
     *
     * @param unitID integer
     *
     * @return integer|false|nil moveDefID Some long description
     * @return string|nil moveDefName Another really, really long description
     */
    `,
  dedent`
    ---Returns a numerical movedef ID and its name.
    ---
    ---@param unitID integer
    ---@return integer|false|nil moveDefID Some long description
    ---@return string|nil moveDefName Another really, really long description
    function Spring.GetUnitMoveDefID(unitID) end
  `
);

testInput(
  "Support multiple function definitions with one comment block",
  dedent`
    /***
     * Example callin.
     *
     * @function Gadget:SomeCallin
     * @function Widget:SomeCallin
     *
     * @param unitID integer
     */
    `,
  dedent`
    ---Example callin.
    ---
    ---@param unitID integer
    function Gadget:SomeCallin(unitID) end

    ---Example callin.
    ---
    ---@param unitID integer
    function Widget:SomeCallin(unitID) end
  `
);
