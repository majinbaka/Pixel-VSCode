extends SceneTree


func _initialize() -> void:
	var arguments := _parse_arguments(OS.get_cmdline_user_args())
	var input_path := String(arguments.get("input", ""))
	var output_path := String(arguments.get("output", ""))
	if input_path.is_empty() or not output_path.begins_with("res://"):
		_fail("Usage: --input <pixelmap.json> --output <res://scene.tscn>")
		return

	var file := FileAccess.open(input_path, FileAccess.READ)
	if file == null:
		_fail("Cannot open map source: %s" % input_path)
		return
	var payload: Variant = JSON.parse_string(file.get_as_text())
	if not payload is Dictionary:
		_fail("Map source is not valid JSON.")
		return

	var map_data := payload as Dictionary
	var tile_set_path := String(map_data.get("tileSet", ""))
	var tile_set := load(tile_set_path) as TileSet
	if tile_set == null:
		_fail("Cannot load TileSet: %s" % tile_set_path)
		return

	var root := Node2D.new()
	root.name = String(map_data.get("name", "GeneratedMap"))
	for raw_layer: Variant in map_data.get("layers", []):
		if not raw_layer is Dictionary:
			continue
		var layer_data := raw_layer as Dictionary
		var layer := TileMapLayer.new()
		layer.name = String(layer_data.get("name", "Layer"))
		layer.z_index = int(layer_data.get("zIndex", 0))
		layer.tile_set = tile_set
		root.add_child(layer)
		layer.owner = root
		for raw_cell: Variant in layer_data.get("cells", []):
			if not raw_cell is Array:
				continue
			var cell := raw_cell as Array
			if cell.size() < 5:
				continue
			var coords := Vector2i(int(cell[0]), int(cell[1]))
			var source_id := int(cell[2])
			var atlas_coords := Vector2i(int(cell[3]), int(cell[4]))
			var alternative := int(cell[5]) if cell.size() > 5 else 0
			layer.set_cell(coords, source_id, atlas_coords, alternative)

	var packed_scene := PackedScene.new()
	var pack_error := packed_scene.pack(root)
	if pack_error != OK:
		root.free()
		_fail("PackedScene.pack failed with error %d." % pack_error)
		return
	var save_error := ResourceSaver.save(packed_scene, output_path)
	root.free()
	if save_error != OK:
		_fail("ResourceSaver.save failed with error %d." % save_error)
		return

	print("[OK] Exported Pixel Monster map to %s" % output_path)
	quit()


func _parse_arguments(arguments: PackedStringArray) -> Dictionary:
	var result := {}
	var index := 0
	while index < arguments.size():
		var key := arguments[index]
		if key.begins_with("--") and index + 1 < arguments.size():
			result[key.trim_prefix("--")] = arguments[index + 1]
			index += 2
			continue
		index += 1
	return result


func _fail(message: String) -> void:
	push_error("[ERROR] %s" % message)
	quit(1)
