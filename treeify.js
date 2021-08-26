class treeify {
    //     treeify.js
    //     Luke Plaster <notatestuser@gmail.com>
    //     https://github.com/notatestuser/treeify.js

    // do the universal module definition dance

    makePrefix(key, last) {
        var str = (last ? '└' : '├');
        if (key) {
            str += '─ ';
        } else {
            str += '──┐';
        }
        return str;
    }

    filterKeys(obj, hideFunctions) {
        let keys = [];
        for (let branch in obj) {
            // always exclude anything in the object's prototype
            if (!obj.hasOwnProperty(branch)) {
                continue;
            }
            // ... and hide any keys mapped to functions if we've been told to
            if (hideFunctions && ((typeof obj[branch]) === "function")) {
                continue;
            }
            keys.push(branch);
        }
        return keys;
    }

    growBranch(key, root, last, lastStates, showValues, hideFunctions, callback) {
        let line = '', index = 0, lastKey, circular, lastStatesCopy = lastStates.slice(0);

        if (lastStatesCopy.push([root, last]) && lastStates.length > 0) {
            // based on the "was last element" states of whatever we're nested within,
            // we need to append either blankness or a branch to our line
            lastStates.forEach(function (lastState, idx) {
                if (idx > 0) {
                    line += (lastState[1] ? ' ' : '│') + '  ';
                }
                if (!circular && lastState[0] === root) {
                    circular = true;
                }
            });

            // the prefix varies based on whether the key contains something to show and
            // whether we're dealing with the last element in this collection
            line += this.makePrefix(key, last) + key;

            // append values and the circular reference indicator
            showValues && (typeof root !== 'object' || root instanceof Date) && (line += ': ' + root);
            circular && (line += ' (circular ref.)');

            callback(line);
        }

        // can we descend into the next item?
        if (!circular && typeof root === 'object') {
            let keys = this.filterKeys(root, hideFunctions);
            let that = this;
            keys.forEach(function (branch) {
                // the last key is always printed with a different prefix, so we'll need to know if we have it
                lastKey = ++index === keys.length;

                // hold your breath for recursive action
                that.growBranch(branch, root[branch], lastKey, lastStatesCopy, showValues, hideFunctions, callback);
            });
        }
    };


    // Treeify.asLines
    // --------------------
    // Outputs the tree line-by-line, calling the lineCallback when each one is available.

    asLines(obj, showValues, hideFunctions, lineCallback) {
        /* hideFunctions and lineCallback are curried, which means we don't break apps using the older form */
        let hideFunctionsArg = typeof hideFunctions !== 'function' ? hideFunctions : false;
        this.growBranch('.', obj, false, [], showValues, hideFunctionsArg, lineCallback || hideFunctions);
    };

    // Treeify.asTree
    // --------------------
    // Outputs the entire tree, returning it as a string with line breaks.

    asTree(obj, showValues, hideFunctions) {
        let tree = '';
        this.growBranch('.', obj, false, [], showValues, hideFunctions, function (line) {
            tree += line + '\n';
        });
        return tree;
    };
}

module.exports.treeify = treeify;