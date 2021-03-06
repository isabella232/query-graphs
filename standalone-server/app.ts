// Load css (through the style-loader of webpack)
import "./app.css";
import "spin.js/spin.css";

// Import thirdparty modules
import {Spinner} from "spin.js";

// Require local modules
import {drawQueryTree} from "@tableau/query-graphs/lib/tree-rendering";
import {loadHyperPlanFromText} from "@tableau/query-graphs/lib/hyper";
import {loadTableauPlan} from "@tableau/query-graphs/lib/tableau";
import {loadJsonFromText} from "@tableau/query-graphs/lib/json";
import {loadTQLPlan} from "@tableau/query-graphs/lib/tql";
import {loadXml} from "@tableau/query-graphs/lib/xml";
import {assert, jsonToStringMap} from "@tableau/query-graphs/lib/loader-utils";
import {TreeDescription, GraphOrientation} from "@tableau/query-graphs/lib/tree-description";
const knownLoaders = new Map<string, any>([
    ["hyper", loadHyperPlanFromText],
    ["tableau", loadTableauPlan],
    ["json", loadJsonFromText],
    ["xml", loadXml],
    ["tql", loadTQLPlan],
    ["raw", JSON.parse],
]);

// Get query parameters from current url
const paramErrors = [] as string[];
let currentSearch = window.location.search;
currentSearch = currentSearch.substring(1);

// Parse using querystring from jquery
const searchParams = new URLSearchParams(currentSearch);

// Get the debug flag
const DEBUG = searchParams.has("debug");

// Get file path
let graphFile = searchParams.get("file") ?? "favorites/logicalquery.xml";

// Get inline graph string
let inlineString;
if (searchParams.has("inline")) {
    inlineString = searchParams.get("inline");
    graphFile = "";
}

// Get file format
const fileFormat = searchParams.get("format");
if (fileFormat !== null && !knownLoaders.has(fileFormat)) {
    paramErrors.push("File format '" + fileFormat + "' not supported.");
}

// Get orientation name
let graphOrientation: GraphOrientation = "top-to-bottom";
if (searchParams.has("orientation")) {
    const orientationParam = searchParams.get("orientation");
    switch (orientationParam) {
        case "top-to-bottom":
        case "right-to-left":
        case "bottom-to-top":
        case "left-to-right":
            graphOrientation = orientationParam;
            break;
        default:
            paramErrors.push("Graph orientation '" + orientationParam + "' not supported.");
            break;
    }
}

// Get node collapse mode 'n' - no/none, 'y' - yes/some, 's' - streamline all secondary nodes
const graphCollapse = searchParams.get("collapse") ?? "s";
switch (graphCollapse) {
    case "n":
    case "y":
    case "s":
        break;
    default:
        paramErrors.push("Graph collapse '" + graphCollapse + "' not supported.");
        break;
}

// Get properties to be rendered in the toplevel info card
let toplevelProperties = new Map<string, string>();
const propertiesParam = searchParams.get("properties");
if (propertiesParam !== null) {
    try {
        toplevelProperties = jsonToStringMap(propertiesParam);
    } catch (err) {
        paramErrors.push("invalid `properties`: " + err + ".");
    }
}

// Add the file name to the displayed properties
if (!inlineString) {
    toplevelProperties.set("file", graphFile);
}

const delay = (function() {
    let timer = 0;
    return (callback: CallableFunction, ms: number) => {
        clearTimeout(timer);
        timer = setTimeout(callback, ms);
    };
})();

//
// Register event listeners not already handled by the query-graphs core
//
function registerEventHandlers(widget: any) {
    document.body.addEventListener(
        "keydown",
        e => {
            // Emit event key codes for debugging
            if (DEBUG) {
                console.log("pressed key " + e.keyCode);
            }

            // On space, expand all currently visible collapsed nodes, that is all for now
            // Subsequent uses may expand additional visible nodes that are now visible
            // Refresh browser window to get back to baseline
            if (e.keyCode === 32) {
                widget.expandOneLevel();
            }
        },
        false,
    );
    window.addEventListener("resize", () => {
        delay(() => widget.resize(), 500);
    });
}

//
// Kick it off
//
const spinner = new Spinner().spin(document.body);
if (paramErrors.length) {
    spinner.stop();
    document.write("invalid parameters!<br>");
    document.write(paramErrors.reduce((a, b) => a + "<br/>" + b));
} else {
    const displayTree = (graphString: string) => {
        // Remove explicit newlines
        graphString = graphString.replace(/\\n/gm, " ");
        // Detect file type
        let loaders;
        if (fileFormat !== null) {
            loaders = [knownLoaders.get(fileFormat)];
        } else if (graphFile.endsWith(".json")) {
            loaders = [loadHyperPlanFromText, loadJsonFromText];
        } else if (graphFile.endsWith(".xml")) {
            loaders = [loadTableauPlan, loadXml];
        } else if (graphFile.endsWith(".twb")) {
            loaders = [loadXml];
        } else if (graphFile.endsWith(".tql")) {
            loaders = [loadTQLPlan];
        } else if (graphFile.endsWith(".log")) {
            loaders = [loadTQLPlan];
        } else {
            loaders = Array.from(knownLoaders.values());
        }

        // Try to load the data with the available loaders
        const errors: string[] = [];
        let loadedTree: TreeDescription | undefined;
        function tryLoad(loader: any) {
            try {
                loadedTree = loader(graphString, graphCollapse);
                return true;
            } catch (err) {
                errors.push(err.toString());
                return false;
            }
        }
        if (loaders.some(tryLoad)) {
            assert(loadedTree !== undefined);
            if (loadedTree.properties === undefined) {
                loadedTree.properties = {};
            }
            for (const [key, value] of toplevelProperties) {
                loadedTree.properties[key] = value;
            }
            loadedTree.graphOrientation = graphOrientation;
            loadedTree.DEBUG = DEBUG;
            spinner.stop();
            const treeContainer = document.createElement("div");
            treeContainer.className = "tree-container";
            document.body.appendChild(treeContainer);
            const widget = drawQueryTree(treeContainer, loadedTree);
            registerEventHandlers(widget);
        } else {
            spinner.stop();
            document.write(errors.reduce((a, b) => a + "<br/>" + b));
        }
    };
    if (inlineString) {
        displayTree(inlineString);
    } else {
        fetch(graphFile)
            .then(response => {
                if (!response.ok)
                    throw new Error(
                        "Request for '" + graphFile + "' failed with '" + response.status + " " + response.statusText + "'.",
                    );
                return response.text();
            })
            .then(displayTree, err => {
                document.write(err);
            });
    }
}
