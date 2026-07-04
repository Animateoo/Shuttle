/**
 * SHUTTLE - ExtendScript (JSX)
 * Handles shape/layer extraction and creation in Photoshop and Illustrator
 * Version 1.0.0
 */

$.global.shuttle = (function () {

    // ══════════════════════════════════════════════════════════
    //  JSON POLYFILL
    // ══════════════════════════════════════════════════════════
    if (typeof JSON !== "object") {
        $.global.JSON = {};
    }
    if (typeof JSON.stringify !== "function") {
        function jsonEscapeStr(s) {
            return String(s)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
        }
        JSON.stringify = function (obj) {
            var t = typeof (obj);
            if (t !== "object" || obj === null) {
                if (t === "string") obj = '"' + jsonEscapeStr(obj) + '"';
                return String(obj);
            } else {
                var n, v, json = [], arr = (obj && obj.constructor === Array);
                for (n in obj) {
                    if (obj.hasOwnProperty(n)) {
                        v = obj[n]; t = typeof(v);
                        if (t === "string") v = '"' + jsonEscapeStr(v) + '"';
                        else if (t === "object" && v !== null) v = JSON.stringify(v);
                        json.push((arr ? "" : '"' + n + '":') + String(v));
                    }
                }
                return (arr ? "[" : "{") + String(json) + (arr ? "]" : "}");
            }
        };
    }
    if (typeof JSON.parse !== "function") {
        JSON.parse = function(str) { return eval("(" + str + ")"); };
    }

    // ══════════════════════════════════════════════════════════
    //  UTILITIES
    // ══════════════════════════════════════════════════════════

    function colorToArray(color) {
        try {
            if (color.typename === 'RGBColor') {
                return [
                    Math.round(color.red),
                    Math.round(color.green),
                    Math.round(color.blue)
                ];
            }
            if (color.typename === 'CMYKColor') {
                // Convert CMYK to RGB approximation
                var r = 255 * (1 - color.cyan / 100) * (1 - color.black / 100);
                var g = 255 * (1 - color.magenta / 100) * (1 - color.black / 100);
                var b = 255 * (1 - color.yellow / 100) * (1 - color.black / 100);
                return [Math.round(r), Math.round(g), Math.round(b)];
            }
            if (color.typename === 'GrayColor') {
                var val = Math.round(255 * (1 - color.gray / 100));
                return [val, val, val];
            }
            if (color.typename === 'SpotColor') {
                return colorToArray(color.spot.color);
            }
        } catch (e) { }
        return [0, 0, 0];
    }

    function arrayToRGBColor(arr) {
        var c = new RGBColor();
        c.red = arr[0];
        c.green = arr[1];
        c.blue = arr[2];
        return c;
    }

    function arrayToSolidColor(arr) {
        var c = new SolidColor();
        c.rgb.red = arr[0];
        c.rgb.green = arr[1];
        c.rgb.blue = arr[2];
        return c;
    }

    function shuttle_getExportFolderForHostDoc(doc, subFolderName) {
        // If the host document is saved, export next to it in a subfolder.
        // Otherwise fall back to OS temp.
        try {
            if (doc && doc.fullName) {
                var parent = doc.fullName.parent;
                var f = new Folder(parent.fsName + "/" + (subFolderName || "Shuttle"));
                if (!f.exists) f.create();
                return f;
            }
        } catch (e) {}
        return Folder.temp;
    }

    function shuttle_cleanupTempFiles(maxAgeHours) {
        try {
            var h = (maxAgeHours && maxAgeHours > 0) ? maxAgeHours : 24;
            var cutoff = new Date().getTime() - (h * 60 * 60 * 1000);
            var files = Folder.temp.getFiles('shuttle_*');
            for (var i = 0; i < files.length; i++) {
                try {
                    var f = files[i];
                    if (f instanceof File) {
                        var t = f.modified.getTime();
                        if (t < cutoff) f.remove();
                    }
                } catch (fe) {}
            }
        } catch (e) {}
    }

    // ══════════════════════════════════════════════════════════
    //  UTILITIES — AI EXPORT
    // ══════════════════════════════════════════════════════════

    function ai_exportItem(item) {
        try {
            var w = Math.max(1, item.width);
            var h = Math.max(1, item.height);
            
            // Fallback to geometric bounds if direct width/height are zero
            if (w <= 1 || h <= 1) {
                try {
                    w = Math.abs(item.geometricBounds[2] - item.geometricBounds[0]);
                    h = Math.abs(item.geometricBounds[1] - item.geometricBounds[3]);
                } catch(e) {}
            }
            
            if (w <= 0 || h <= 0) return null;
            
            // Create a temporary document for export
            var tempDoc = app.documents.add(DocumentColorSpace.RGB, w, h);
            var dup = item.duplicate(tempDoc, ElementPlacement.PLACEATEND);
            
            // Align to artboard top-left
            dup.position = [0, h];
            
            var outFolder = Folder.temp;
            try { outFolder = shuttle_getExportFolderForHostDoc(app.activeDocument, "Shuttle"); } catch(eo) {}
            var tempFile = new File(outFolder.fsName + "/shuttle_ai_" + new Date().getTime() + "_" + Math.floor(Math.random()*1000) + ".png");
            var exportOpts = new ExportOptionsPNG24();
            exportOpts.antiAliasing = true;
            exportOpts.transparency = true;
            exportOpts.artBoardClipping = true;
            
            tempDoc.exportFile(tempFile, ExportType.PNG24, exportOpts);
            tempDoc.close(SaveOptions.DONOTSAVECHANGES);
            
            return tempFile.fsName;
        } catch (e) {
            return null;
        }
    }

    function ai_exportSelectionToAiFile(sel, bounds, preferredName) {
        var tmpDoc = null;
        try {
            if (!sel || sel.length === 0) return null;
            var minX = bounds.minX, maxX = bounds.maxX, aiTop = bounds.aiTop, aiBottom = bounds.aiBottom;
            if (minX === Infinity || maxX === -Infinity || aiTop === -Infinity || aiBottom === Infinity) return null;

            var w = Math.max(1, maxX - minX);
            var h = Math.max(1, Math.abs(aiTop - aiBottom));

            var baseFolder = new Folder(Folder.myDocuments.fsName + "/ShuttleLinks");
            if (!baseFolder.exists) baseFolder.create();

            var safeName = (preferredName && typeof preferredName === 'string') ? preferredName : 'AI_Link';
            safeName = safeName.replace(/^\s+|\s+$/g, '');
            if (!safeName || /^<.*>$/.test(safeName)) safeName = 'AI_Link';
            safeName = safeName.replace(/[\\\/:\*\?"<>\|]/g, '_');
            safeName = safeName.replace(/\s+/g, ' ');

            var outFile = new File(baseFolder.fsName + "/shuttle_link_" + safeName + "_" + new Date().getTime() + ".ai");

            tmpDoc = app.documents.add(DocumentColorSpace.RGB, w, h);

            for (var i = 0; i < sel.length; i++) {
                try {
                    var it = sel[i];
                    var dup = it.duplicate(tmpDoc, ElementPlacement.PLACEATEND);
                    var gb = it.geometricBounds;
                    dup.position = [gb[0] - minX, gb[1] - aiBottom];
                } catch (de) {}
            }

            try { tmpDoc.artboards[0].artboardRect = [0, h, w, 0]; } catch (ab) {}

            var opts = new IllustratorSaveOptions();
            opts.compatibility = Compatibility.ILLUSTRATOR17;
            opts.pdfCompatible = true;
            opts.embedICCProfile = false;
            opts.compressed = true;

            tmpDoc.saveAs(outFile, opts);
            tmpDoc.close(SaveOptions.DONOTSAVECHANGES);
            tmpDoc = null;

            return { path: outFile.fsName, widthPt: w, heightPt: h };
        } catch (e) {
            try { if (tmpDoc) tmpDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (ce) {}
            return null;
        }
    }

    // AI->PS uses temp .ai export + Place in Photoshop (not OS clipboard).

    // ══════════════════════════════════════════════════════════
    //  ILLUSTRATOR — Get Selection
    // ══════════════════════════════════════════════════════════

    // AI->PS: export selection to a temp .ai file (no OS clipboard — faster and more reliable).

    function ai_getSelection(prefsStr) {
        var prefs = (typeof prefsStr === 'string') ? eval('(' + prefsStr + ')') : prefsStr;
        var doc;

        try {
            doc = app.activeDocument;
        } catch (e) {
            return JSON.stringify({ error: 'No Illustrator document open' });
        }

        var sel = doc.selection;
        if (!sel || sel.length === 0) {
            return JSON.stringify([]);
        }

        var minX = Infinity, maxX = -Infinity, aiTop = -Infinity, aiBottom = Infinity;
        for (var k = 0; k < sel.length; k++) {
            try {
                var gb = sel[k].geometricBounds;
                if (gb[0] < minX) minX = gb[0];
                if (gb[2] > maxX) maxX = gb[2];
                if (gb[1] > aiTop)    aiTop    = gb[1];
                if (gb[3] < aiBottom) aiBottom = gb[3];
            } catch(be) {}
        }

        var selW = (minX !== Infinity) ? (maxX - minX) : 0;
        var selH = (aiTop !== -Infinity) ? Math.abs(aiTop - aiBottom) : 0;
        // Single item: use native width/height (more accurate for rectangles/paths).
        if (sel.length === 1) {
            try {
                var one = sel[0];
                if (one.width !== undefined && Math.abs(one.width) > 0) selW = Math.abs(one.width);
                if (one.height !== undefined && Math.abs(one.height) > 0) selH = Math.abs(one.height);
                var gb1 = one.geometricBounds;
                minX = gb1[0]; maxX = gb1[2]; aiTop = gb1[1]; aiBottom = gb1[3];
            } catch (oneErr) {}
        }

        var preferredName = (sel.length === 1 && sel[0].name) ? sel[0].name : '';
        var bounds = { minX: minX, maxX: maxX, aiTop: aiTop, aiBottom: aiBottom };
        var artboard = null;
        var artboardSize = null;
        try {
            var abIdx = doc.artboards.getActiveArtboardIndex();
            var abRect = doc.artboards[abIdx].artboardRect;
            artboard = [abRect[0], abRect[1], abRect[2], abRect[3]];
            artboardSize = [Math.abs(abRect[2] - abRect[0]), Math.abs(abRect[1] - abRect[3])];
        } catch (abErr) {}

        var exported = ai_exportSelectionToAiFile(sel, bounds, preferredName);

        if (!exported || !exported.path) {
            return JSON.stringify({ error: 'Failed to export selection to .ai file' });
        }

        return JSON.stringify([{
            name: preferredName,
            type: 'image',
            imagePath: exported.path,
            linked: true,
            artboard: artboard,
            artboardSize: artboardSize,
            aiLeft: minX !== Infinity ? minX : 0,
            aiTop:  aiTop !== -Infinity ? aiTop : 0,
            size: [exported.widthPt, exported.heightPt],
            exportSizePt: [exported.widthPt, exported.heightPt],
            position: [minX !== Infinity ? minX : 0, aiTop !== -Infinity ? aiTop : 0]
        }]);
    }

    function ai_extractItem(item, prefs) {
        var obj = {
            name: item.name || ('Element_' + Math.floor(Math.random() * 9999)),
            type: 'unknown',
            position: [item.left, item.top],
            size: [item.width, item.height],
            opacity: (item.opacity !== undefined) ? item.opacity : 100,
            fillColor: null,
            strokeColor: null,
            strokeWidth: 0,
            pathPoints: [],
            children: [],
            textContent: null,
            textProperties: null,
            closed: true
        };

        try {
            // ── PathItem ──
            if (item.typename === 'PathItem') {
                obj.type = 'path';
                obj.closed = item.closed;

                if (prefs.transferColors) {
                    if (item.filled) {
                        obj.fillColor = colorToArray(item.fillColor);
                    }
                    if (item.stroked) {
                        obj.strokeColor = colorToArray(item.strokeColor);
                        obj.strokeWidth = item.strokeWidth;
                    }
                }

                // Extract path points
                var pts = item.pathPoints;
                for (var p = 0; p < pts.length; p++) {
                    obj.pathPoints.push({
                        anchor: pts[p].anchor,
                        leftDirection: pts[p].leftDirection,
                        rightDirection: pts[p].rightDirection,
                        pointType: pts[p].pointType.toString()
                    });
                }
            }

            // ── CompoundPathItem ──
            else if (item.typename === 'CompoundPathItem') {
                obj.type = 'compoundPath';
                var paths = item.pathItems;
                for (var cp = 0; cp < paths.length; cp++) {
                    var subPath = ai_extractItem(paths[cp], prefs);
                    if (subPath) obj.children.push(subPath);
                }
            }

            // ── GroupItem ──
            else if (item.typename === 'GroupItem') {
                obj.type = 'group';
                var groupItems = item.pageItems;
                for (var gi = 0; gi < groupItems.length; gi++) {
                    var child = ai_extractItem(groupItems[gi], prefs);
                    if (child) obj.children.push(child);
                }
            }

            // ── TextFrame ──
            else if (item.typename === 'TextFrame') {
                obj.type = 'text';
                obj.textContent = item.contents;

                if (prefs.editableText) {
                    try {
                        var tf = item.textRange;
                        obj.textProperties = {
                            font: tf.characterAttributes.textFont.name,
                            size: tf.characterAttributes.size,
                            color: colorToArray(tf.characterAttributes.fillColor),
                            justification: item.paragraphs[0] ? item.paragraphs[0].justification.toString() : 'LEFT'
                        };
                    } catch (te) {
                        obj.textProperties = {
                            font: 'ArialMT',
                            size: 24,
                            color: [0, 0, 0],
                            justification: 'LEFT'
                        };
                    }
                }
            }

            // ── Other types (Raster, Placed, Symbols, etc.) ──
            else {
                obj.type = 'image';
                obj.imagePath = ai_exportItem(item);
                if (!obj.imagePath) {
                    obj.type = item.typename || 'unknown';
                }
            }

        } catch (e) {
            obj.type = 'error';
            obj.name = 'Error: ' + e.message;
        }

        return obj;
    }

    // ══════════════════════════════════════════════════════════
    //  ILLUSTRATOR — Import Shapes (from Photoshop)
    // ══════════════════════════════════════════════════════════

    var ai_lastImportStr = "";
    var ai_lastImportTime = 0;

    function ai_importShapes(dataStr) {
        var data = (typeof dataStr === 'string') ? eval('(' + dataStr + ')') : dataStr;
        var prefs = data.prefs || {};
        var shapes = data.shapes || [];
        var doc;

        // ── DIAGNOSTIC LOG ──────────────────────────────────────
        var diag = [];
        diag.push("[ai_importShapes] shapes.length=" + shapes.length);
        for (var di = 0; di < shapes.length; di++) {
            var ds = shapes[di];
            diag.push("  shape[" + di + "]: type=" + ds.type + " name='" + ds.name + "' children=" + (ds.children ? ds.children.length : 0) + " hasImagePath=" + (ds.imagePath ? 'YES' : 'NO'));
            if (ds.imagePath) diag.push("    imagePath=" + ds.imagePath);
        }
        // ────────────────────────────────────────────────────────

        // Harden deduplication using stable content (types + names + sizes).
        // NEVER use imagePath as key — it contains a timestamp and changes every export.
        var dedupeKey = "";
        try {
            var parts = [];
            for (var dk = 0; dk < shapes.length; dk++) {
                var s = shapes[dk] || {};
                parts.push([
                    s.type || '',
                    s.name || '',
                    (s.size && s.size.length > 1) ? (Math.round(s.size[0]) + 'x' + Math.round(s.size[1])) : ''
                ].join('@'));
            }
            dedupeKey = shapes.length + "|" + parts.join('||');
        } catch(e) { dedupeKey = ""; }
        
        var now = new Date().getTime();
        if (dedupeKey && dedupeKey === ai_lastImportStr && (now - ai_lastImportTime) < 5000) {
            diag.push("[DEDUP-BLOCKED] key=" + dedupeKey);
            return JSON.stringify({ count: 0, diag: diag.join('|||') }); // Skip duplicate dispatch
        }
        if (dedupeKey) {
            ai_lastImportStr = dedupeKey;
            ai_lastImportTime = now;
            diag.push("[DEDUP-PASS] key=" + dedupeKey);
        }

        try {
            doc = app.activeDocument;
        } catch (e) {
            try {
                doc = app.documents.add();
            } catch (e2) {
                return JSON.stringify({ error: 'Cannot create document', count: 0 });
            }
        }

        var itemsBefore = 0;
        try { itemsBefore = doc.pageItems.length; } catch(e) {}
        diag.push("[AI doc] pageItems BEFORE import: " + itemsBefore);

        var addedItems = [];
        var count = 0;

        for (var i = 0; i < shapes.length; i++) {
            var shape = shapes[i];
            try {
                var itemCountBefore = 0;
                try { itemCountBefore = doc.pageItems.length; } catch(e) {}

                var item = ai_createItem(doc, shape, prefs, null);

                var itemCountAfter = 0;
                try { itemCountAfter = doc.pageItems.length; } catch(e) {}

                diag.push("  ai_createItem[" + i + "]: returned=" + (item ? item.typename : 'null') + " pageItems " + itemCountBefore + "->" + itemCountAfter + " (delta=" + (itemCountAfter - itemCountBefore) + ")");

                if (item) {
                    addedItems.push(item);
                    count++;
                }
            } catch (e) {
                diag.push("  ai_createItem[" + i + "] THREW: " + e.message);
            }
        }

        var itemsAfter = 0;
        try { itemsAfter = doc.pageItems.length; } catch(e) {}
        diag.push("[AI doc] pageItems AFTER import: " + itemsAfter + " (total new=" + (itemsAfter - itemsBefore) + ")");

        app.redraw();
        // Use ||| as separator — newlines break the JSX JSON polyfill's string escaping
        return JSON.stringify({ count: count, diag: diag.join('|||') });
    }

    function ai_createItem(doc, shape, prefs, parentGroup) {
        var layer = parentGroup || doc.activeLayer;

        // ── Text ──
        if (shape.type === 'text' && shape.textContent) {
            var expectedNameT = shape.name || 'Text';
            if (layer && layer.textFrames) {
                try {
                    for (var eti = layer.textFrames.length - 1; eti >= 0; eti--) {
                        if (layer.textFrames[eti].name === expectedNameT) layer.textFrames[eti].remove();
                    }
                } catch(delErrT) {}
            }
            var tf = layer.textFrames.add();
            tf.contents = shape.textContent;
            tf.name = expectedNameT;

            if (prefs.keepPosition && shape.position) {
                tf.left = shape.position[0];
                // PS uses Y-down; Illustrator uses Y-up.
                tf.top = -shape.position[1];
            }

            if (shape.textProperties) {
                try {
                    var range = tf.textRange;
                    range.characterAttributes.size = shape.textProperties.size || 24;
                    if (shape.textProperties.color) {
                        range.characterAttributes.fillColor = arrayToRGBColor(shape.textProperties.color);
                    }
                    try {
                        range.characterAttributes.textFont = app.textFonts.getByName(shape.textProperties.font);
                    } catch (fe) { }
                } catch (te) { }
            }
            return tf;
        }

        // ── Path ──
        if (shape.type === 'path' && shape.pathPoints && shape.pathPoints.length > 0) {
            var expectedNameP = shape.name || 'Path';
            if (layer && layer.pathItems) {
                try {
                    for (var epi = layer.pathItems.length - 1; epi >= 0; epi--) {
                        if (layer.pathItems[epi].name === expectedNameP) layer.pathItems[epi].remove();
                    }
                } catch(delErrP) {}
            }
            var path = layer.pathItems.add();
            path.name = expectedNameP;
            path.closed = shape.closed !== false;

            path.setEntirePath(shape.pathPoints.map(function (pt) { return pt.anchor; }));

            // Set bezier handles
            for (var p = 0; p < shape.pathPoints.length && p < path.pathPoints.length; p++) {
                path.pathPoints[p].leftDirection = shape.pathPoints[p].leftDirection;
                path.pathPoints[p].rightDirection = shape.pathPoints[p].rightDirection;
            }

            if (prefs.transferColors) {
                if (shape.fillColor) {
                    path.filled = true;
                    path.fillColor = arrayToRGBColor(shape.fillColor);
                } else {
                    path.filled = false;
                }

                if (shape.strokeColor) {
                    path.stroked = true;
                    path.strokeColor = arrayToRGBColor(shape.strokeColor);
                    path.strokeWidth = shape.strokeWidth || 1;
                } else {
                    path.stroked = false;
                }
                
                // Eradicate invisible ghost paths that lack visual data
                if (!path.filled && !path.stroked) {
                    path.remove();
                    return null;
                }
            }

            if (shape.opacity !== undefined && shape.opacity !== 100) {
                path.opacity = shape.opacity;
            }

            return path;
        }

        // ── Rectangle (from PS explicit rectangles) ──
        if (shape.type === 'rect') {
            var pos = shape.position || [0, 0];
            var sz = shape.size || [100, 100];
            var rect = layer.pathItems.rectangle(
                -pos[1], pos[0],
                sz[0], sz[1]
            );
            rect.name = shape.name || 'Rectangle';

            if (prefs.transferColors && shape.fillColor) {
                rect.filled = true;
                rect.fillColor = arrayToRGBColor(shape.fillColor);
            }
            if (shape.opacity !== undefined && shape.opacity !== 100) {
                rect.opacity = shape.opacity;
            }
            return rect;
        }

        // ── Group ──
        if (shape.type === 'group' && shape.children) {
            var grp = layer.groupItems.add();
            grp.name = shape.name || 'Group';

            for (var c = 0; c < shape.children.length; c++) {
                var child = ai_createItem(doc, shape.children[c], prefs, grp);
                if (child) {
                    try {
                        child.move(grp, ElementPlacement.PLACEATEND);
                    } catch (me) { }
                }
            }
            return grp;
        }

        // ── Image (from PS raster layers) ──
        if (shape.type === 'image' && shape.imagePath) {
            var f = new File(shape.imagePath);
            if (f.exists) {
                var placed = null;
                try {
                    // CRITICAL FIX: To prevent visual duplication during testing/syncing, 
                    // we automatically remove any exact pre-existing layer with the identical name 
                    // within the current parent layer before placing the updated one.
                    var expectedName = shape.name || 'Image';
                    // IMPORTANT: we add via doc.placedItems.add(), so cleanup must also target doc.placedItems
                    // (layer.placedItems may not include document-level placed items reliably).
                    try {
                        for (var ei = doc.placedItems.length - 1; ei >= 0; ei--) {
                            try {
                                if (doc.placedItems[ei].name === expectedName) {
                                    doc.placedItems[ei].remove();
                                }
                            } catch (dei) {}
                        }
                    } catch(delErr) {}

                    placed = doc.placedItems.add();
                    placed.file = f;
                    placed.name = expectedName;

                    // Use try-catch around spatial/sizing attributes because Illustrator evaluates 
                    // extremely large offsets or crazy scaling percentages as exceptions ("value greater than maximum").
                    var pos3 = shape.position || [0, 0];
                    try {
                        placed.left = pos3[0];
                        placed.top = -pos3[1];
                    } catch(ePos) {} // Ignore if far off pasteboard limits (2270 inches)
                    
                    try {
                        var nativeW = placed.width;
                        if (shape.size && shape.size[0] > 0 && nativeW > 0) {
                            var scalePer = (shape.size[0] / nativeW) * 100;
                            // Prevent scaling to 1 million percent if native is tiny
                            if (scalePer !== 100 && scalePer < 20000) {
                                placed.resize(scalePer, scalePer, true, true, true, true, scalePer);
                            }
                        }
                    } catch(eResize) {
                        try {
                            // Fallback exactly to absolute dimension if resize throws max limit exception
                            placed.width = shape.size[0];
                            placed.height = shape.size[1];
                        } catch(eWH) {}
                    }
                    
                    try {
                        if (shape.opacity !== undefined && shape.opacity !== 100) {
                            placed.opacity = shape.opacity;
                        }
                    } catch(eOp) {}

                    // Move if it was supposed to be inside a sub-group
                    if (parentGroup) {
                        try { placed.move(parentGroup, ElementPlacement.PLACEATEND); } catch(me) {}
                    }
                    
                    return placed;
                } catch(eCrit) {
                    // CRITICAL FIX: If anything fatal throws, clean up the created placedItem 
                    // so we don't leak "Layer 2" duplicate ghosts into the document.
                    if (placed) {
                        try { placed.remove(); } catch(rmE) {}
                    }
                    throw new Error("Placement fatal error: " + eCrit.message); // pass to parent loop
                }
            }
        }

        // ── Fallback ──
        // Removed emergency grey placeholder box generator. We no longer pollute
        // the user's artboard with mystery grey vectors. If it's an empty node (like a group bounds), discard it quietly.
        return null;
    }

    // ══════════════════════════════════════════════════════════
    //  PHOTOSHOP — Get Selection
    // ══════════════════════════════════════════════════════════

    function ps_getSelection(prefsStr) {
        var prefs = (typeof prefsStr === 'string') ? eval('(' + prefsStr + ')') : prefsStr;
        var doc;

        try {
            doc = app.activeDocument;
        } catch (e) {
            return JSON.stringify({ error: 'No Photoshop document open' });
        }

        var results = [];
        var selectedLayers = ps_getSelectedLayers(doc);
        var uniqueLayerIds = {};
        var uniqueBounds = {};

        if (selectedLayers.length === 0) {
            return JSON.stringify([]);
        }

        // Deduplicate layers logically to prevent PS ActionManager returning Group+Child
        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            if (uniqueLayerIds[layer.id]) continue;
            uniqueLayerIds[layer.id] = true;

            var bKey = layer.bounds.left.toFixed(1) + '_' + layer.bounds.top.toFixed(1) + '_' + layer.bounds.right.toFixed(1) + '_' + layer.bounds.bottom.toFixed(1);
            if (uniqueBounds[bKey]) {
                // If it shares the exact same boundary box, it's very likely a group wrapping the child, or a redundant duplicate selection
                continue; 
            }
            uniqueBounds[bKey] = true;

            var data = ps_extractLayer(layer, prefs, doc);
            if (data) results.push(data);
        }

        return JSON.stringify(results);
    }

    function ps_getSelectedLayers(doc) {
        var layers = [];

        try {
            // Use Action Manager to get selected layers
            var ref = new ActionReference();
            ref.putProperty(charIDToTypeID('Prpr'), stringIDToTypeID('targetLayersIDs'));
            ref.putEnumerated(charIDToTypeID('Dcmn'), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
            var desc = executeActionGet(ref);
            var idList = desc.getList(stringIDToTypeID('targetLayersIDs'));

            for (var i = 0; i < idList.count; i++) {
                var layerId = idList.getReference(i).getIdentifier();
                var layerRef = new ActionReference();
                layerRef.putIdentifier(charIDToTypeID('Lyr '), layerId);

                try {
                    var layerDesc = executeActionGet(layerRef);
                    var layerName = layerDesc.getString(charIDToTypeID('Nm  '));
                    var layerIdx = layerDesc.getInteger(charIDToTypeID('ItmI'));

                    // Get bounds
                    var boundsDesc = layerDesc.getObjectValue(stringIDToTypeID('bounds'));
                    var left = boundsDesc.getUnitDoubleValue(charIDToTypeID('Left'));
                    var top = boundsDesc.getUnitDoubleValue(charIDToTypeID('Top '));
                    var right = boundsDesc.getUnitDoubleValue(charIDToTypeID('Rght'));
                    var bottom = boundsDesc.getUnitDoubleValue(charIDToTypeID('Btom'));

                    var opacity = layerDesc.getUnitDoubleValue(charIDToTypeID('Opct'));
                    var kind = layerDesc.getInteger(stringIDToTypeID('layerKind'));

                    var isVisible = true;
                    try { isVisible = layerDesc.getBoolean(charIDToTypeID('Vsbl')); } catch (e) { }
                    
                    var isBackground = false;
                    try { isBackground = layerDesc.getBoolean(stringIDToTypeID('background')); } catch (e) { }
                    
                    var isArtboard = false;
                    try { isArtboard = layerDesc.getBoolean(stringIDToTypeID('artboardEnabled')); } catch (e) { }
                    if (!isArtboard) {
                        try { isArtboard = layerDesc.hasKey(stringIDToTypeID('artboard')); } catch(e) {}
                    }

                    // Skip hidden layers, document backgrounds, and Artboard containers (which act as invisible shape layers)
                    if (!isVisible || isBackground || isArtboard) {
                        continue;
                    }

                    layers.push({
                        id: layerId,
                        name: layerName,
                        index: layerIdx,
                        bounds: { left: left, top: top, right: right, bottom: bottom },
                        opacity: opacity,
                        kind: kind
                    });
                } catch (le) { }
            }
        } catch (e) {
            // Fallback: use active layer
            try {
                var al = doc.activeLayer;
                if (al) {
                    layers.push({
                        id: 0,
                        name: al.name,
                        index: 0,
                        bounds: {
                            left: al.bounds[0].as('px'),
                            top: al.bounds[1].as('px'),
                            right: al.bounds[2].as('px'),
                            bottom: al.bounds[3].as('px')
                        },
                        opacity: al.opacity,
                        kind: al.kind === LayerKind.TEXT ? 3 : 1
                    });
                }
            } catch (fe) { }
        }

        return layers;
    }

    function ps_extractLayer(layerInfo, prefs, doc) {
        var obj = {
            name: layerInfo.name || 'Layer',
            type: 'bounds',
            position: [layerInfo.bounds.left, layerInfo.bounds.top],
            size: [
                layerInfo.bounds.right - layerInfo.bounds.left,
                layerInfo.bounds.bottom - layerInfo.bounds.top
            ],
            opacity: layerInfo.opacity || 100,
            fillColor: null,
            strokeColor: null,
            strokeWidth: 0,
            pathPoints: [],
            children: [],
            textContent: null,
            textProperties: null,
            closed: true,
            imagePath: null
        };

        var extracted = false;

        // Attempt vector path extraction
        try {
            if (layerInfo.kind === 4) { // Shape layer
                obj.type = 'path';
                obj = ps_extractShapePath(layerInfo, obj, prefs, doc);
                extracted = true;
            }
        } catch (pe) { }

        // Text layer
        try {
            if (layerInfo.kind === 3) { // Text layer
                obj.type = 'text';
                obj = ps_extractText(layerInfo, obj, prefs, doc);
                extracted = true;
            }
        } catch (te) { }

        // Raster layer or fallback (Export to PNG)
        if (!extracted && obj.size[0] > 0 && obj.size[1] > 0) {
            obj.type = 'image';
            try {
                // Focus layer by ID explicitly
                var selectRef = new ActionReference();
                selectRef.putIdentifier(charIDToTypeID('Lyr '), layerInfo.id);
                var selectDesc = new ActionDescriptor();
                selectDesc.putReference(charIDToTypeID('null'), selectRef);
                executeAction(charIDToTypeID('slct'), selectDesc, DialogModes.NO);

                var targetLayer = doc.activeLayer;

                // Safest Native DOM duplicate without Unit math cross-evaluation
                var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution, "shuttle_tmp", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
                app.activeDocument = doc;
                var dup = targetLayer.duplicate(tempDoc, ElementPlacement.PLACEATEND);
                app.activeDocument = tempDoc;

                // Crop precisely to mathematically extracted bounds
                try {
                    var cropBounds = [
                        new UnitValue(layerInfo.bounds.left, 'px'),
                        new UnitValue(layerInfo.bounds.top, 'px'),
                        new UnitValue(layerInfo.bounds.right, 'px'),
                        new UnitValue(layerInfo.bounds.bottom, 'px')
                    ];
                    tempDoc.crop(cropBounds);
                } catch(cropErr) {}

                // Export PNG (prefer folder next to saved PSD)
                var outFolder = Folder.temp;
                try { outFolder = shuttle_getExportFolderForHostDoc(doc, "Shuttle"); } catch(eo2) {}
                var tempFile = new File(outFolder.fsName + "/shuttle_img_" + new Date().getTime() + ".png");
                var saveOpts = new PNGSaveOptions();
                saveOpts.compression = 0;
                saveOpts.interlaced = false;
                tempDoc.saveAs(tempFile, saveOpts, true, Extension.LOWERCASE);
                tempDoc.close(SaveOptions.DONOTSAVECHANGES);

                app.activeDocument = doc; // Restore active doc cleanly
                obj.imagePath = tempFile.fsName;
            } catch (rasterErr) {
                // Do not fallback to bounds to prevent mysterious grey paths!
            }
        }

        // Try to get fill color for shape/solid layers
        if (prefs.transferColors && !obj.fillColor && obj.type !== 'image') {
            try {
                obj.fillColor = ps_getLayerFillColor(layerInfo);
            } catch (ce) { }
        }

        return obj;
    }

    function ps_extractShapePath(layerInfo, obj, prefs, doc) {
        try {
            // Use Action Manager to get vector mask path
            var ref = new ActionReference();
            ref.putEnumerated(stringIDToTypeID('path'), charIDToTypeID('Ordn'), stringIDToTypeID('vectorMask'));
            ref.putIdentifier(charIDToTypeID('Lyr '), layerInfo.id);
            var pathDesc = executeActionGet(ref);

            var pathContents = pathDesc.getObjectValue(stringIDToTypeID('pathContents'));
            var subPaths = pathContents.getList(stringIDToTypeID('subpathListKey'));

            obj.pathPoints = [];

            for (var sp = 0; sp < subPaths.count; sp++) {
                var subPathDesc = subPaths.getObjectValue(sp);
                var points = subPathDesc.getList(stringIDToTypeID('points'));
                obj.closed = subPathDesc.getBoolean(stringIDToTypeID('closedSubpath'));

                var subPathPoints = [];
                for (var pt = 0; pt < points.count; pt++) {
                    var ptDesc = points.getObjectValue(pt);
                    var anchor = ptDesc.getObjectValue(stringIDToTypeID('anchor'));
                    var fwd = ptDesc.getObjectValue(stringIDToTypeID('forward'));
                    var bwd = ptDesc.getObjectValue(stringIDToTypeID('backward'));

                    var docW = doc.width.as('px');
                    var docH = doc.height.as('px');

                    subPathPoints.push({
                        anchor: [
                            anchor.getUnitDoubleValue(charIDToTypeID('Hrzn')) * docW,
                            -anchor.getUnitDoubleValue(charIDToTypeID('Vrtc')) * docH
                        ],
                        rightDirection: [
                            fwd.getUnitDoubleValue(charIDToTypeID('Hrzn')) * docW,
                            -fwd.getUnitDoubleValue(charIDToTypeID('Vrtc')) * docH
                        ],
                        leftDirection: [
                            bwd.getUnitDoubleValue(charIDToTypeID('Hrzn')) * docW,
                            -bwd.getUnitDoubleValue(charIDToTypeID('Vrtc')) * docH
                        ],
                        pointType: 'PointType.SMOOTH'
                    });
                }

                // If split to layers enabled, each subpath becomes a child
                if (prefs.splitLayers && subPaths.count > 1) {
                    obj.type = 'group';
                    obj.children.push({
                        name: obj.name + '_path_' + sp,
                        type: 'path',
                        position: obj.position,
                        size: obj.size,
                        opacity: obj.opacity,
                        fillColor: obj.fillColor,
                        strokeColor: obj.strokeColor,
                        strokeWidth: obj.strokeWidth,
                        pathPoints: subPathPoints,
                        closed: obj.closed,
                        children: [],
                        textContent: null,
                        textProperties: null
                    });
                } else {
                    obj.pathPoints = obj.pathPoints.concat(subPathPoints);
                }
            }

        } catch (e) {
            // Vector path extraction failed; keep as bounds
            obj.type = 'bounds';
        }

        return obj;
    }

    function ps_extractText(layerInfo, obj, prefs, doc) {
        try {
            var ref = new ActionReference();
            ref.putIdentifier(charIDToTypeID('Lyr '), layerInfo.id);
            var layerDesc = executeActionGet(ref);
            var textDesc = layerDesc.getObjectValue(stringIDToTypeID('textKey'));
            obj.textContent = textDesc.getString(stringIDToTypeID('textKey'));

            if (prefs.editableText) {
                var styleList = textDesc.getList(stringIDToTypeID('textStyleRange'));
                if (styleList.count > 0) {
                    var styleDesc = styleList.getObjectValue(0);
                    var textStyle = styleDesc.getObjectValue(stringIDToTypeID('textStyle'));

                    var fontSize = 24;
                    var fontName = 'ArialMT';
                    var fontColor = [0, 0, 0];

                    try { fontSize = textStyle.getUnitDoubleValue(stringIDToTypeID('size')); } catch (e2) { }
                    try { fontName = textStyle.getString(stringIDToTypeID('fontPostScriptName')); } catch (e3) { }
                    try {
                        var colorDesc = textStyle.getObjectValue(charIDToTypeID('Clr '));
                        fontColor = [
                            Math.round(colorDesc.getDouble(charIDToTypeID('Rd  '))),
                            Math.round(colorDesc.getDouble(charIDToTypeID('Grn '))),
                            Math.round(colorDesc.getDouble(charIDToTypeID('Bl  ')))
                        ];
                    } catch (e4) { }

                    obj.textProperties = {
                        font: fontName,
                        size: fontSize,
                        color: fontColor,
                        justification: 'LEFT'
                    };
                }
            }
        } catch (e) {
            // Text extraction may fail on certain layer types, keep textContent if possible
            try {
                // Fallback using DOM
                var activeLayer = doc.activeLayer;
                if (activeLayer.kind === LayerKind.TEXT) {
                    obj.textContent = activeLayer.textItem.contents;
                    if (prefs.editableText) {
                        obj.textProperties = {
                            font: activeLayer.textItem.font,
                            size: activeLayer.textItem.size.as('pt'),
                            color: [
                                activeLayer.textItem.color.rgb.red,
                                activeLayer.textItem.color.rgb.green,
                                activeLayer.textItem.color.rgb.blue
                            ],
                            justification: activeLayer.textItem.justification.toString()
                        };
                    }
                }
            } catch (fe) { }
        }
        return obj;
    }

    function ps_getLayerFillColor(layerInfo) {
        // Unconditionally return null for now. 
        // We will let Illustrator assign default or no color to paths, 
        // to forcefully prevent any hidden grey adjustment layers from being rendered.
        return null;
    }

    // ══════════════════════════════════════════════════════════
    //  PHOTOSHOP — Import Utilities
    // ══════════════════════════════════════════════════════════

    function ps_claimImportOnce(key) {
        if (!key) return true;
        if (!$.global.__shuttleImportClaims) $.global.__shuttleImportClaims = {};
        var now = new Date().getTime();
        var prev = $.global.__shuttleImportClaims[key];
        if (prev && (now - prev) < 15000) return false;
        $.global.__shuttleImportClaims[key] = now;
        return true;
    }

    function ps_getAiPlacementTarget(doc, shape) {
        var psDpi = 72;
        try { psDpi = parseFloat(doc.resolution); } catch (e) {}
        var scale = psDpi / 72.0;

        var aiX = (shape.aiLeft !== undefined) ? shape.aiLeft : shape.position[0];
        var aiTop = (shape.aiTop !== undefined) ? shape.aiTop : shape.position[1];

        // Default: coordinates relative to active Illustrator artboard (matches what you see on canvas).
        var psX = aiX * scale;
        var psY = aiTop * scale;
        if (shape.artboard && shape.artboard.length === 4) {
            var ab = shape.artboard;
            psX = (aiX - ab[0]) * scale;
            // Illustrator Y-up: artboard top (ab[1]) is larger than selection top (aiTop).
            psY = (ab[1] - aiTop) * scale;
        }

        return { x: psX, y: psY, scale: scale };
    }

    function ps_layerSizePx(layer) {
        var b = layer.bounds;
        return {
            w: b[2].as('px') - b[0].as('px'),
            h: b[3].as('px') - b[1].as('px'),
            x: b[0].as('px'),
            y: b[1].as('px')
        };
    }

    function ps_fitLayerToAiSize(layer, shape, doc) {
        var sizePt = shape.exportSizePt || shape.size;
        if (!sizePt || sizePt[0] <= 0 || sizePt[1] <= 0) return;

        var placement = ps_getAiPlacementTarget(doc, shape);
        var targetW = sizePt[0] * placement.scale;
        var targetH = sizePt[1] * placement.scale;

        for (var attempt = 0; attempt < 4; attempt++) {
            var sz = ps_layerSizePx(layer);
            if (sz.w < 1) break;
            var scalePct = (targetW / sz.w) * 100;
            if (Math.abs(scalePct - 100) < 0.2) break;
            layer.resize(scalePct, scalePct, AnchorPosition.TOPLEFT);
        }
    }

    function ps_importSmartObject(doc, shape, prefs) {
        try {
            var f = new File(shape.imagePath);
            if (!f.exists) return 'File not found: ' + shape.imagePath;

            app.activeDocument = doc;

            function getTopLayerId() {
                try { return (doc.layers.length > 0) ? doc.layers[0].id : null; } catch (e) { return null; }
            }

            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID('null'), f);
            desc.putEnumerated(charIDToTypeID('FTcs'), charIDToTypeID('QCSt'), charIDToTypeID('Qcsa'));
            try {
                desc.putUnitDouble(charIDToTypeID('Wdth'), charIDToTypeID('#Prc'), 100.0);
                desc.putUnitDouble(charIDToTypeID('Hght'), charIDToTypeID('#Prc'), 100.0);
            } catch (pe) {}

            function tryPlace(actionToken, useStringId) {
                var idBefore = getTopLayerId();
                try {
                    if (useStringId) executeAction(stringIDToTypeID(actionToken), desc, DialogModes.NO);
                    else executeAction(charIDToTypeID(actionToken), desc, DialogModes.NO);
                    return true;
                } catch (e) {
                    var idAfter = getTopLayerId();
                    if (idAfter !== null && idAfter !== idBefore) return true;
                    return false;
                }
            }

            var placed = false;
            if (shape && shape.linked) {
                placed = tryPlace('placeLinked', true);
                if (!placed) placed = tryPlace('PlcL', false);
            }
            if (!placed) placed = tryPlace('Plc ', false);
            if (!placed) return 'Error: Place failed';

            var layer = doc.activeLayer;

            try {
                var fileBase = f.name.replace(/\.[^.]+$/, '');
                if (fileBase) layer.name = fileBase;
                else if (shape.name && shape.name.length && !/^<.*>$/.test(shape.name)) layer.name = shape.name;
            } catch (ne) {}

            // Force exact Illustrator size (Place Linked often scales to doc width).
            ps_fitLayerToAiSize(layer, shape, doc);

            if (!prefs || prefs.keepPosition !== false) {
                try {
                    var target = ps_getAiPlacementTarget(doc, shape);
                    var sz2 = ps_layerSizePx(layer);
                    layer.translate(target.x - sz2.x, target.y - sz2.y);
                } catch (posErr) {}
            }

            if (shape.opacity !== undefined && shape.opacity !== 100) {
                try { layer.opacity = shape.opacity; } catch(oe) {}
            }

            return 'OK';
        } catch (e) {
            return 'Error: ' + String(e.message).replace(/\s+/g, ' ');
        }
    }

    // ══════════════════════════════════════════════════════════
    //  PHOTOSHOP — Import Shapes (from Illustrator)
    // ══════════════════════════════════════════════════════════

    function ps_importShapes(dataStr) {
        var diag = [];
        var data;
        
        try {
            if (typeof dataStr === 'string') {
                data = JSON.parse(dataStr);
            } else {
                data = dataStr;
            }
        } catch(e) {
            return JSON.stringify({ error: 'JSON Parse Error: ' + e.message, count: 0 });
        }

        var prefs = data.prefs || {};
        var shapes = data.shapes || [];
        var doc;

        var claimKey = '';
        if (data.requestId) claimKey = String(data.requestId);
        else if (data._msgId) claimKey = String(data._msgId);
        else if (shapes.length > 0 && shapes[0].imagePath) claimKey = String(shapes[0].imagePath);
        if (claimKey && !ps_claimImportOnce(claimKey)) {
            diag.push('[ps_importShapes] Duplicate import blocked (claim): ' + claimKey);
            return JSON.stringify({ count: 0, skippedDuplicate: true, diag: diag.join('|||') });
        }

        diag.push("[ps_importShapes] Received " + shapes.length + " items");

        try {
            doc = app.activeDocument;
        } catch (e) {
            try {
                doc = app.documents.add(1920, 1080, 72, 'Shuttle Import', NewDocumentMode.RGB);
            } catch (e2) {
                return JSON.stringify({ error: 'Cannot create document', count: 0 });
            }
        }

        try { app.activeDocument = doc; } catch (adErr) {}

        var count = 0;
        var importFailed = false;
        for (var i = 0; i < shapes.length; i++) {
            try {
                var sh = shapes[i];
                var res;
                if (sh.imagePath) {
                    res = ps_importSmartObject(doc, sh, prefs);
                    diag.push('  Item[' + i + ']: file-place -> ' + res);
                    if (String(res).indexOf('Error') === 0) importFailed = true;
                    else count++;
                } else if (sh.nativeClipboard) {
                    res = ps_pasteNative(doc, sh, prefs);
                    diag.push('  Item[' + i + ']: clipboard-paste -> ' + res);
                    if (String(res).indexOf('Paste failed') !== -1 || String(res).indexOf('Paste Error') !== -1) {
                        importFailed = true;
                    } else {
                        count++;
                    }
                } else {
                    res = ps_createFromShape(doc, sh, prefs);
                    diag.push('  Item[' + i + ']: ' + sh.type + ' -> ' + (res || 'OK'));
                    count++;
                }
            } catch (e) {
                importFailed = true;
                diag.push('  Item[' + i + '] FAILED: ' + String(e.message).replace(/\s+/g, ' '));
            }
        }

        if (importFailed && count === 0) {
            return JSON.stringify({ count: 0, error: 'Paste/import failed', diag: diag.join('|||') });
        }

        return JSON.stringify({ count: count, diag: diag.join('|||') });
    }

    function ps_pasteNative(doc, shape, prefs) {
        var destType = shape.type || 'smart_object';
        function _sanitizeCustomName(nm) {
            var s = (nm && typeof nm === 'string') ? nm : '';
            s = s.replace(/^\s+|\s+$/g, '');
            if (!s) return null;
            // Ignore AI generic auto names, keep Photoshop default name.
            if (/^<.*>$/.test(s)) return null;
            s = s.replace(/[\\\/:\*\?"<>\|]/g, '_');
            s = s.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
            return s || null;
        }
        var targetName = _sanitizeCustomName(shape.name);

        try {
            app.activeDocument = doc;
            try { app.bringToFront(); } catch (bf2) {}
            $.sleep(500);

            // ── 1. Fast targeted cleanup (avoid heavy recursive deletion) ──
            try {
                function _deleteTopLevelByName(layers, nm) {
                    if (!nm) return;
                    for (var li = layers.length - 1; li >= 0; li--) {
                        try {
                            if (layers[li].name === nm) { layers[li].remove(); }
                        } catch(e) {}
                    }
                }
                if (targetName) {
                    _deleteTopLevelByName(doc.layers, targetName);
                } else {
                    // For AI generic names (<Rectangle>, <Path>, etc.), keep PS default naming
                    // but still prevent duplicate accumulation by replacing default SO layer.
                    _deleteTopLevelByName(doc.layers, 'Vector Smart Object');
                }
            } catch(delErr) {}

            // ── 2. Build paste descriptor ──
            var idpast = charIDToTypeID('past');
            var desc = new ActionDescriptor();
            var idAs = charIDToTypeID('As  ');
            if (destType === 'shape') {
                try { desc.putClass(idAs, stringIDToTypeID('shapeLayer')); } catch(se) {}
            } else {
                desc.putClass(idAs, stringIDToTypeID('smartObject'));
            }

            // ── 3. Paste silently with retry (NO dialog fallback) ──
            // PS a veces lanza error aunque el pegado ya ocurrió; reintentar duplicaba capas.
            var topIdBefore = null;
            try {
                if (doc.layers.length > 0) topIdBefore = doc.layers[0].id;
            } catch (idB) {}

            var pasteOk = false;
            var pasteErr = '';
            for (var attempt = 0; attempt < 6; attempt++) {
                try {
                    executeAction(idpast, desc, DialogModes.NO);
                    pasteOk = true;
                    break;
                } catch (pe) {
                    pasteErr = String(pe.message).replace(/\s+/g, ' ');
                    var topIdAfter = null;
                    try {
                        if (doc.layers.length > 0) topIdAfter = doc.layers[0].id;
                    } catch (idA) {}
                    if (topIdAfter !== null && topIdAfter !== topIdBefore) {
                        pasteOk = true;
                        break;
                    }
                    $.sleep(650);
                }
            }
            if (!pasteOk) {
                return 'Paste failed after 6 attempts: ' + pasteErr;
            }

            var layer = doc.activeLayer;

            // ── 4. Preserve Photoshop default layer name unless custom clean name exists ──
            if (targetName) {
                try { layer.name = targetName; } catch(nameErr) {}
            }

            // ── 5. Resize to match AI source dimensions ──
            // When clipboard paste happens, PS scales the content for its own resolution.
            // shape.size is in Illustrator points (1pt = 1px @ 72dpi).
            // Convert to PS pixels: aiPts * (psResolution / 72).
            if (shape.size && shape.size[0] > 0 && shape.size[1] > 0) {
                try {
                    var psDpi = 72;
                    try { psDpi = parseFloat(doc.resolution); } catch(re) {}
                    var scale = psDpi / 72.0;

                    var targetW = shape.size[0] * scale; // in PS pixels
                    var targetH = shape.size[1] * scale;

                    var bounds = layer.bounds;
                    var curW = bounds[2].as('px') - bounds[0].as('px');
                    var curH = bounds[3].as('px') - bounds[1].as('px');

                    if (curW > 1 && targetW > 1) {
                        var scalePctW = (targetW / curW) * 100;
                        var scalePctH = (targetH / curH) * 100;
                        // Only resize if meaningfully different (>1%)
                        if (Math.abs(scalePctW - 100) > 1) {
                            layer.resize(scalePctW, scalePctH, AnchorPosition.TOPLEFT);
                        }
                    }
                } catch(sizeErr) {}
            }

            return 'Pasted (' + destType + ')';
        } catch (e) {
            return 'Paste Error: ' + e.message;
        }
    }

    function ps_createFromShape(doc, shape, prefs) {
        // ── Text ──
        if (shape.type === 'text' && shape.textContent) {
            var textLayer = doc.artLayers.add();
            textLayer.kind = LayerKind.TEXT;
            textLayer.name = shape.name || 'Text';
            textLayer.textItem.contents = shape.textContent;

            if (shape.textProperties) {
                try {
                    textLayer.textItem.size = new UnitValue(shape.textProperties.size || 24, 'pt');
                } catch (se) { }
                try {
                    textLayer.textItem.font = shape.textProperties.font || 'ArialMT';
                } catch (fe) { }
                if (shape.textProperties.color) {
                    textLayer.textItem.color = arrayToSolidColor(shape.textProperties.color);
                }
            }

            if (prefs.keepPosition && shape.position) {
                try {
                    textLayer.textItem.position = [
                        new UnitValue(shape.position[0], 'px'),
                        new UnitValue(-shape.position[1], 'px')  // AI uses inverted Y
                    ];
                } catch (pe) { }
            }

            if (shape.opacity !== undefined && shape.opacity !== 100) {
                textLayer.opacity = shape.opacity;
            }

            return;
        }

        // ── Path / Shape ──
        if (shape.type === 'path' && shape.pathPoints && shape.pathPoints.length > 0) {
            ps_createShapeLayer(doc, shape, prefs);
            return;
        }

        // ── Image / Smart Object ──
        if (shape.type === 'image' && shape.imagePath) {
            ps_importSmartObject(doc, shape, prefs);
            return;
        }

        // ── Group ──
        if (shape.type === 'group' && shape.children && shape.children.length > 0) {
            var groupLayer = doc.layerSets.add();
            groupLayer.name = shape.name || 'Group';

            for (var c = 0; c < shape.children.length; c++) {
                // Set active doc to ensure we create in right context
                app.activeDocument = doc;
                ps_createFromShape(doc, shape.children[c], prefs);
                // Move newly created layer into group
                try {
                    doc.activeLayer.move(groupLayer, ElementPlacement.PLACEATEND);
                } catch (me) { }
            }

            if (shape.opacity !== undefined && shape.opacity !== 100) {
                groupLayer.opacity = shape.opacity;
            }
            return;
        }

        // ── Bounds / Rect fallback ──
        if (shape.size && shape.size[0] > 0 && shape.size[1] > 0) {
            var fillColor = shape.fillColor || [200, 200, 200];
            ps_createRectShape(doc, shape.name || 'Imported',
                shape.position || [0, 0], shape.size,
                fillColor, shape.opacity || 100, prefs);
        }
    }

    function ps_createShapeLayer(doc, shape, prefs) {
        try {
            var desc = new ActionDescriptor();
            var ref = new ActionReference();
            ref.putClass(stringIDToTypeID('contentLayer'));
            desc.putReference(charIDToTypeID('null'), ref);

            // Fill color
            var fillDesc = new ActionDescriptor();
            var colorDesc = new ActionDescriptor();
            var solidDesc = new ActionDescriptor();
            var fc = shape.fillColor || [128, 128, 128];
            solidDesc.putDouble(charIDToTypeID('Rd  '), fc[0]);
            solidDesc.putDouble(charIDToTypeID('Grn '), fc[1]);
            solidDesc.putDouble(charIDToTypeID('Bl  '), fc[2]);
            colorDesc.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), solidDesc);
            fillDesc.putObject(charIDToTypeID('Type'), stringIDToTypeID('solidColorLayer'), colorDesc);

            // Shape path construction
            var shapeDesc = new ActionDescriptor();
            var subPathList = new ActionList();

            function addSubPath(pts, closed) {
                if (!pts || pts.length === 0) return;
                var spDesc = new ActionDescriptor();
                var pList = new ActionList();
                for (var i = 0; i < pts.length; i++) {
                    var p = pts[i];
                    var ad = new ActionDescriptor();
                    
                    var anc = new ActionDescriptor();
                    anc.putUnitDouble(charIDToTypeID('Hrzn'), charIDToTypeID('#Pxl'), p.anchor[0]);
                    anc.putUnitDouble(charIDToTypeID('Vrtc'), charIDToTypeID('#Pxl'), -p.anchor[1]);
                    ad.putObject(stringIDToTypeID('anchor'), charIDToTypeID('Pnt '), anc);

                    var fwd = new ActionDescriptor();
                    fwd.putUnitDouble(charIDToTypeID('Hrzn'), charIDToTypeID('#Pxl'), p.rightDirection[0]);
                    fwd.putUnitDouble(charIDToTypeID('Vrtc'), charIDToTypeID('#Pxl'), -p.rightDirection[1]);
                    ad.putObject(stringIDToTypeID('forward'), charIDToTypeID('Pnt '), fwd);

                    var bwd = new ActionDescriptor();
                    bwd.putUnitDouble(charIDToTypeID('Hrzn'), charIDToTypeID('#Pxl'), p.leftDirection[0]);
                    bwd.putUnitDouble(charIDToTypeID('Vrtc'), charIDToTypeID('#Pxl'), -p.leftDirection[1]);
                    ad.putObject(stringIDToTypeID('backward'), charIDToTypeID('Pnt '), bwd);

                    ad.putBoolean(stringIDToTypeID('smooth'), true);
                    pList.putObject(stringIDToTypeID('pathPoint'), ad);
                }
                spDesc.putList(stringIDToTypeID('points'), pList);
                spDesc.putBoolean(stringIDToTypeID('closedSubpath'), closed !== false);
                subPathList.putObject(stringIDToTypeID('subpathListKey'), spDesc);
            }

            // Handle main path and sub-paths (Compound Paths)
            if (shape.pathPoints && shape.pathPoints.length > 0) {
                addSubPath(shape.pathPoints, shape.closed);
            }
            if (shape.children) {
                for (var j = 0; j < shape.children.length; j++) {
                    if (shape.children[j].pathPoints) {
                        addSubPath(shape.children[j].pathPoints, shape.children[j].closed);
                    }
                }
            }

            shapeDesc.putList(stringIDToTypeID('subpathListKey'), subPathList);
            fillDesc.putObject(charIDToTypeID('Shp '), stringIDToTypeID('pathClass'), shapeDesc);
            desc.putObject(charIDToTypeID('Usng'), stringIDToTypeID('contentLayer'), fillDesc);

            executeAction(charIDToTypeID('Mk  '), desc, DialogModes.NO);
            doc.activeLayer.name = shape.name || 'Shape';

            if (shape.opacity !== undefined && shape.opacity !== 100) {
                doc.activeLayer.opacity = shape.opacity;
            }

            if (prefs.transferColors && shape.strokeColor && shape.strokeWidth > 0) {
                ps_addStroke(shape.strokeColor, shape.strokeWidth);
            }
            return "Shape OK";
        } catch (e) {
            return "Shape Error: " + e.message;
        }
    }

    function ps_addStroke(color, width) {
        try {
            var desc = new ActionDescriptor();
            var ref = new ActionReference();
            ref.putProperty(charIDToTypeID('Prpr'), charIDToTypeID('Lefx'));
            ref.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
            desc.putReference(charIDToTypeID('null'), ref);

            var fxDesc = new ActionDescriptor();
            var strokeDesc = new ActionDescriptor();
            strokeDesc.putBoolean(stringIDToTypeID('enabled'), true);
            strokeDesc.putEnumerated(stringIDToTypeID('paintType'), stringIDToTypeID('frameFill'), stringIDToTypeID('solidColor'));
            strokeDesc.putEnumerated(stringIDToTypeID('style'), stringIDToTypeID('frameStyle'), stringIDToTypeID('centeredFrame'));

            var sizeDesc = new ActionDescriptor();
            strokeDesc.putUnitDouble(charIDToTypeID('Sz  '), charIDToTypeID('#Pxl'), width);

            var scDesc = new ActionDescriptor();
            scDesc.putDouble(charIDToTypeID('Rd  '), color[0]);
            scDesc.putDouble(charIDToTypeID('Grn '), color[1]);
            scDesc.putDouble(charIDToTypeID('Bl  '), color[2]);
            strokeDesc.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), scDesc);

            fxDesc.putObject(stringIDToTypeID('frameFX'), stringIDToTypeID('frameFX'), strokeDesc);
            desc.putObject(charIDToTypeID('T   '), charIDToTypeID('Lefx'), fxDesc);

            executeAction(charIDToTypeID('setd'), desc, DialogModes.NO);
        } catch (e) { }
    }

    function ps_createRectShape(doc, name, position, size, fillColor, opacity, prefs) {
        try {
            // Convert AI coordinates (Y-up) to PS (Y-down)
            var left = position[0];
            var top = -position[1]; // flip Y from Illustrator
            var right = left + size[0];
            var bottom = top + size[1];

            var desc = new ActionDescriptor();
            var ref = new ActionReference();
            ref.putClass(stringIDToTypeID('contentLayer'));
            desc.putReference(charIDToTypeID('null'), ref);

            var fillDesc = new ActionDescriptor();
            var colorDesc = new ActionDescriptor();
            var solidDesc = new ActionDescriptor();
            solidDesc.putDouble(charIDToTypeID('Rd  '), fillColor[0]);
            solidDesc.putDouble(charIDToTypeID('Grn '), fillColor[1]);
            solidDesc.putDouble(charIDToTypeID('Bl  '), fillColor[2]);
            colorDesc.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), solidDesc);
            fillDesc.putObject(charIDToTypeID('Type'), stringIDToTypeID('solidColorLayer'), colorDesc);

            var shapeDesc = new ActionDescriptor();
            var unitLeft = charIDToTypeID('#Pxl');
            shapeDesc.putUnitDouble(charIDToTypeID('Top '), unitLeft, top);
            shapeDesc.putUnitDouble(charIDToTypeID('Left'), unitLeft, left);
            shapeDesc.putUnitDouble(charIDToTypeID('Btom'), unitLeft, bottom);
            shapeDesc.putUnitDouble(charIDToTypeID('Rght'), unitLeft, right);

            fillDesc.putObject(charIDToTypeID('Shp '), charIDToTypeID('Rctn'), shapeDesc);
            desc.putObject(charIDToTypeID('Usng'), stringIDToTypeID('contentLayer'), fillDesc);
            executeAction(charIDToTypeID('Mk  '), desc, DialogModes.NO);

            doc.activeLayer.name = name || 'Rectangle';
            if (opacity !== undefined && opacity !== 100) {
                doc.activeLayer.opacity = opacity;
            }
        } catch (e) {
            // Last resort: make a normal layer
            var layer = doc.artLayers.add();
            layer.name = name || 'Imported';
        }
    }

    // ══════════════════════════════════════════════════════════
    //  DEEP DIAGNOSTIC — ps_dumpSelection (run from PS panel)
    // ══════════════════════════════════════════════════════════

    function ps_dumpSelection() {
        var log = ['=== SHUTTLE DEEP SCAN (Photoshop) ==='];
        var doc;
        try { doc = app.activeDocument; } catch(e) { return JSON.stringify({ log: 'No PS document open' }); }

        log.push('Doc: ' + doc.name + '  W=' + doc.width + '  H=' + doc.height + '  Res=' + doc.resolution);

        // Raw layer list via Action Manager
        var rawLayers = [];
        try {
            var ref = new ActionReference();
            ref.putProperty(charIDToTypeID('Prpr'), stringIDToTypeID('targetLayersIDs'));
            ref.putEnumerated(charIDToTypeID('Dcmn'), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
            var desc = executeActionGet(ref);
            var idList = desc.getList(stringIDToTypeID('targetLayersIDs'));
            log.push('Action Manager targetLayersIDs count: ' + idList.count);

            for (var i = 0; i < idList.count; i++) {
                var layerId = idList.getReference(i).getIdentifier();
                var layerRef = new ActionReference();
                layerRef.putIdentifier(charIDToTypeID('Lyr '), layerId);
                var layerDesc = executeActionGet(layerRef);

                var lName = '?'; try { lName = layerDesc.getString(charIDToTypeID('Nm  ')); } catch(e2) {}
                var lKind = -1; try { lKind = layerDesc.getInteger(stringIDToTypeID('layerKind')); } catch(e3) {}
                var lOpct = 100; try { lOpct = layerDesc.getUnitDoubleValue(charIDToTypeID('Opct')); } catch(e4) {}
                var lVsbl = true; try { lVsbl = layerDesc.getBoolean(charIDToTypeID('Vsbl')); } catch(e5) {}
                var lBg = false; try { lBg = layerDesc.getBoolean(stringIDToTypeID('background')); } catch(e6) {}
                var lArb = false;
                try { lArb = layerDesc.getBoolean(stringIDToTypeID('artboardEnabled')); } catch(e7) {}
                try { if (!lArb) lArb = layerDesc.hasKey(stringIDToTypeID('artboard')); } catch(e8) {}

                var bL=0, bT=0, bR=0, bB=0;
                try {
                    var bDesc = layerDesc.getObjectValue(stringIDToTypeID('bounds'));
                    bL = bDesc.getUnitDoubleValue(charIDToTypeID('Left'));
                    bT = bDesc.getUnitDoubleValue(charIDToTypeID('Top '));
                    bR = bDesc.getUnitDoubleValue(charIDToTypeID('Rght'));
                    bB = bDesc.getUnitDoubleValue(charIDToTypeID('Btom'));
                } catch(e9) {}

                var kindNames = {0:'background',1:'pixel/raster',2:'logicalGroup',3:'text',4:'shape',5:'fillLayer',6:'adjustLayer',7:'smartObject'};
                var kindStr = kindNames[lKind] || ('kind=' + lKind);

                log.push('  [' + i + '] id=' + layerId + ' name="' + lName + '" kind=' + kindStr + ' visible=' + lVsbl + ' bg=' + lBg + ' artboard=' + lArb);
                log.push('       bounds L=' + bL.toFixed(1) + ' T=' + bT.toFixed(1) + ' R=' + bR.toFixed(1) + ' B=' + bB.toFixed(1) + ' W=' + (bR-bL).toFixed(1) + ' H=' + (bB-bT).toFixed(1));
                log.push('       opacity=' + lOpct);

                rawLayers.push({ id: layerId, name: lName, kind: lKind, bounds: { left:bL, top:bT, right:bR, bottom:bB }, visible: lVsbl, bg: lBg, artboard: lArb });
            }
        } catch(e) {
            log.push('ERROR reading targetLayersIDs: ' + e.message);
        }

        // Simulate dedup
        log.push('--- Simulating dedup (bounds key) ---');
        var seenIds = {}, seenBounds = {};
        var finalLayers = [];
        for (var j = 0; j < rawLayers.length; j++) {
            var rl = rawLayers[j];
            if (seenIds[rl.id]) { log.push('  SKIP id=' + rl.id + ' (duplicate id)'); continue; }
            seenIds[rl.id] = true;
            var bk = rl.bounds.left.toFixed(1) + '_' + rl.bounds.top.toFixed(1) + '_' + rl.bounds.right.toFixed(1) + '_' + rl.bounds.bottom.toFixed(1);
            if (seenBounds[bk]) { log.push('  SKIP id=' + rl.id + ' name="' + rl.name + '" (same bounds: ' + bk + ')'); continue; }
            if (rl.bg || rl.artboard || !rl.visible) { log.push('  SKIP id=' + rl.id + ' name="' + rl.name + '" (bg/artboard/hidden)'); continue; }
            seenBounds[bk] = true;
            finalLayers.push(rl);
            log.push('  PASS id=' + rl.id + ' name="' + rl.name + '" bounds=' + bk);
        }

        log.push('--- After dedup: ' + finalLayers.length + ' layer(s) would be extracted ---');
        for (var k = 0; k < finalLayers.length; k++) {
            var fl = finalLayers[k];
            var kindStr2 = fl.kind === 4 ? 'SHAPE->path' : fl.kind === 3 ? 'TEXT->text' : 'RASTER->image(PNG)';
            log.push('  [' + k + '] "' + fl.name + '" -> type: ' + kindStr2);
        }

        log.push('=== END SCAN ===');
        return JSON.stringify({ log: log.join('|||') });
    }

    // ══════════════════════════════════════════════════════════
    //  DEEP DIAGNOSTIC — ai_runDiagnostic (run from AI panel)
    // ══════════════════════════════════════════════════════════

    function ai_runDiagnostic(imagePath) {
        var log = ['=== SHUTTLE DEEP SCAN (Illustrator) ==='];
        var doc;
        try { doc = app.activeDocument; } catch(e) { return JSON.stringify({ log: 'No AI document open' }); }

        log.push('Doc: ' + doc.name + '  Layers: ' + doc.layers.length);
        log.push('Active layer: "' + doc.activeLayer.name + '"  type=' + doc.activeLayer.typename);
        log.push('pageItems total: ' + doc.pageItems.length);
        log.push('placedItems total: ' + doc.placedItems.length);

        // List all current items
        for (var x = 0; x < doc.pageItems.length; x++) {
            var pi = doc.pageItems[x];
            log.push('  existing[' + x + ']: typename=' + pi.typename + ' name="' + pi.name + '"');
        }

        if (!imagePath) {
            log.push('NO imagePath provided — skip placement test');
            log.push('=== END SCAN ===');
            return JSON.stringify({ log: log.join('|||') });
        }

        var f = new File(imagePath);
        log.push('Test file: ' + f.fsName + '  exists=' + f.exists);

        if (!f.exists) {
            log.push('File does not exist, cannot test placement');
            log.push('=== END SCAN ===');
            return JSON.stringify({ log: log.join('|||') });
        }

        // Test METHOD A: doc.placedItems.add()
        log.push('--- TEST METHOD A: doc.placedItems.add() ---');
        var countA_before = doc.placedItems.length;
        var countPage_before = doc.pageItems.length;
        var placedA;
        try {
            placedA = doc.placedItems.add();
            placedA.file = f;
            placedA.name = 'TEST_METHOD_A';
            var countA_after = doc.placedItems.length;
            var countPage_after = doc.pageItems.length;
            log.push('  placedItems: ' + countA_before + ' -> ' + countA_after + '  delta=' + (countA_after - countA_before));
            log.push('  pageItems:   ' + countPage_before + ' -> ' + countPage_after + '  delta=' + (countPage_after - countPage_before));
            log.push('  returned typename: ' + placedA.typename);
            // List ALL items now
            for (var ya = 0; ya < doc.pageItems.length; ya++) {
                log.push('    pageItem[' + ya + ']: typename=' + doc.pageItems[ya].typename + ' name="' + doc.pageItems[ya].name + '"');
            }
            // Cleanup
            try { placedA.remove(); } catch(er) {}
        } catch(eA) {
            log.push('  METHOD A THREW: ' + eA.message);
        }

        // Test METHOD B: layer.placedItems.add()
        log.push('--- TEST METHOD B: layer.placedItems.add() ---');
        var countB_before = doc.placedItems.length;
        var countBPage_before = doc.pageItems.length;
        var placedB;
        try {
            placedB = doc.activeLayer.placedItems.add();
            placedB.file = f;
            placedB.name = 'TEST_METHOD_B';
            var countB_after = doc.placedItems.length;
            var countBPage_after = doc.pageItems.length;
            log.push('  placedItems: ' + countB_before + ' -> ' + countB_after + '  delta=' + (countB_after - countB_before));
            log.push('  pageItems:   ' + countBPage_before + ' -> ' + countBPage_after + '  delta=' + (countBPage_after - countBPage_before));
            log.push('  returned typename: ' + placedB.typename);
            for (var yb = 0; yb < doc.pageItems.length; yb++) {
                log.push('    pageItem[' + yb + ']: typename=' + doc.pageItems[yb].typename + ' name="' + doc.pageItems[yb].name + '"');
            }
            try { placedB.remove(); } catch(er2) {}
        } catch(eB) {
            log.push('  METHOD B THREW: ' + eB.message);
        }

        log.push('=== END SCAN ===');
        return JSON.stringify({ log: log.join('|||') });
    }

    // ══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════

    return {
        ai_getSelection: ai_getSelection,
        ai_importShapes: ai_importShapes,
        ps_getSelection: ps_getSelection,
        ps_importShapes: ps_importShapes,
        ps_dumpSelection: ps_dumpSelection,
        ai_runDiagnostic: ai_runDiagnostic
    };

})();

