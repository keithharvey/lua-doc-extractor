import dedent from "dedent-js";
import { testInput } from "./utility/harness";

const opts = { stripHelpers: true };

testInput(
  "stripHelpers: keeps function declarations",
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
    function Spring.GetGameFrame() end
  `,
  undefined,
  opts
);

testInput(
  "stripHelpers: keeps table declarations",
  dedent`
    /*** @table Spring.MoveCtrl */
  `,
  dedent`
    Spring.MoveCtrl = {}
  `,
  undefined,
  opts
);

testInput(
  "stripHelpers: strips standalone class",
  dedent`
    /***
     * @class losAccess
     * @x_helper
     * @field public private boolean? only readable by the ally (default)
     * @field public allied boolean? readable by ally + ingame allied
     */
  `,
  ``,
  undefined,
  opts
);

testInput(
  "stripHelpers: strips standalone enum",
  dedent`
    /***
     * @enum LosMask
     * @field LOS_INLOS integer
     * @field LOS_INRADAR integer
     */
  `,
  ``,
  undefined,
  opts
);

testInput(
  "stripHelpers: strips standalone alias",
  dedent`
    /***
     * @alias Heading integer
     */
  `,
  ``,
  undefined,
  opts
);

testInput(
  "stripHelpers: keeps function, strips class from same input",
  dedent`
    /***
     * @class losAccess
     * @x_helper
     * @field public private boolean? only readable by the ally (default)
     */

    /***
     * Set game rules param.
     *
     * @function Spring.SetGameRulesParam
     * @param name string
     */
  `,
  dedent`
    ---Set game rules param.
    ---
    ---@param name string
    function Spring.SetGameRulesParam(name) end
  `,
  undefined,
  opts
);

testInput(
  "stripHelpers: combines with table-mapping",
  dedent`
    /***
     * @class losAccess
     * @x_helper
     * @field public private boolean? only readable by the ally (default)
     */

    /***
     * @function Spring.SetGameRulesParam
     * @param name string
     */
  `,
  dedent`
    ---@param name string
    function SpringSynced.SetGameRulesParam(name) end
  `,
  undefined,
  { ...opts, tableMapping: new Map([["Spring", "SpringSynced"]]) }
);
