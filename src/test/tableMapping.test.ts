import dedent from "dedent-js";
import { testInput } from "./utility/harness";

const springToSynced = new Map([["Spring", "SpringSynced"]]);

testInput(
  "Remaps function table name",
  dedent`
    /***
     * Get the current game frame.
     *
     * @function Spring.GetGameFrame
     * @return integer frame
     */
  `,
  dedent`
    ---Get the current game frame.
    ---
    ---@return integer frame
    function SpringSynced.GetGameFrame() end
  `,
  undefined,
  { tableMapping: springToSynced }
);

testInput(
  "Remaps method table name",
  dedent`
    /***
     * Does foo.
     *
     * @function Spring:Foo
     * @param x integer
     */
  `,
  dedent`
    ---Does foo.
    ---
    ---@param x integer
    function SpringSynced:Foo(x) end
  `,
  undefined,
  { tableMapping: springToSynced }
);

testInput(
  "Remaps table declaration",
  dedent`
    /*** @table Spring */
  `,
  dedent`
    SpringSynced = {}
  `,
  undefined,
  { tableMapping: springToSynced }
);

testInput(
  "Remaps nested table declaration",
  dedent`
    /*** @table Spring.MoveCtrl */
  `,
  dedent`
    SpringSynced.MoveCtrl = {}
  `,
  undefined,
  { tableMapping: springToSynced }
);

testInput(
  "Remaps field table name",
  dedent`
    /***
     * @field Spring.MoveCtrl MoveCtrl
     */
  `,
  dedent`
    ---@type MoveCtrl
    SpringSynced.MoveCtrl = nil
  `,
  undefined,
  { tableMapping: springToSynced }
);

testInput(
  "Leaves unmapped tables unchanged",
  dedent`
    /***
     * Does bar.
     *
     * @function Other.Bar
     * @param y number
     */
  `,
  dedent`
    ---Does bar.
    ---
    ---@param y number
    function Other.Bar(y) end
  `,
  undefined,
  { tableMapping: springToSynced }
);

testInput(
  "No mapping passes through unchanged",
  dedent`
    /***
     * @function Spring.Foo
     * @param x integer
     */
  `,
  dedent`
    ---@param x integer
    function Spring.Foo(x) end
  `
);

testInput(
  "Remaps function with multiple params and return",
  dedent`
    /***
     * Changes alliance.
     *
     * @function Spring.SetAlly
     * @param firstAllyTeamID integer
     * @param secondAllyTeamID integer
     * @param ally boolean
     * @return nil
     */
  `,
  dedent`
    ---Changes alliance.
    ---
    ---@param firstAllyTeamID integer
    ---@param secondAllyTeamID integer
    ---@param ally boolean
    ---@return nil
    function SpringSynced.SetAlly(firstAllyTeamID, secondAllyTeamID, ally) end
  `,
  undefined,
  { tableMapping: springToSynced }
);

testInput(
  "Remaps merged table with functions",
  dedent`
    /*** @table Spring */

    /***
     * @function Spring.Foo
     * @param x integer
     */

    /***
     * @function Spring.Bar
     * @param y string
     */
  `,
  dedent`
    SpringSynced = {}

    ---@param x integer
    function SpringSynced.Foo(x) end

    ---@param y string
    function SpringSynced.Bar(y) end
  `,
  undefined,
  { tableMapping: springToSynced }
);
