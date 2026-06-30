extends SceneTree


func _initialize() -> void:
	var arguments := _parse_arguments(OS.get_cmdline_user_args())
	var input_path := String(arguments.get("input", ""))
	var output_path := String(arguments.get("output", ""))
	if input_path.is_empty() or not output_path.begins_with("res://"):
		_fail("Usage: --input <pixelhud.json> --output <res://scene.tscn>")
		return

	var file := FileAccess.open(input_path, FileAccess.READ)
	if file == null:
		_fail("Cannot open HUD source: %s" % input_path)
		return
	var payload: Variant = JSON.parse_string(file.get_as_text())
	if not payload is Dictionary:
		_fail("HUD source is not valid JSON.")
		return

	var hud_data := payload as Dictionary
	var root := CanvasLayer.new()
	root.name = _node_name(String(hud_data.get("name", "GeneratedHud")), "GeneratedHud")

	var viewport := hud_data.get("viewport", {}) as Dictionary
	var canvas := Control.new()
	canvas.name = "Root"
	canvas.size = Vector2(float(viewport.get("width", 640)), float(viewport.get("height", 360)))
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(canvas)
	canvas.owner = root

	for raw_element: Variant in hud_data.get("elements", []):
		if not raw_element is Dictionary:
			continue
		var element := raw_element as Dictionary
		var node := _create_element(element)
		if node == null:
			continue
		canvas.add_child(node)
		node.owner = root

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

	print("[OK] Exported Pixel Monster HUD to %s" % output_path)
	quit(0)


func _create_element(element: Dictionary) -> Control:
	var kind := String(element.get("kind", "panel"))
	var node: Control
	match kind:
		"label":
			node = _create_label(element)
		"bar":
			node = _create_bar(element)
		"button":
			node = _create_button(element)
		"slot":
			node = _create_slot(element)
		"minimap":
			node = _create_minimap(element)
		_:
			node = _create_panel(element)

	node.name = _node_name(String(element.get("id", "")), "HudElement")
	node.unique_name_in_owner = true
	_apply_rect(node, element.get("rect", {}) as Dictionary)
	return node


func _create_panel(element: Dictionary) -> Panel:
	var panel := Panel.new()
	panel.add_theme_stylebox_override("panel", _style_box(
		String(element.get("fill", "#101916")),
		String(element.get("stroke", "#7a6d47")),
		4
	))
	return panel


func _create_label(element: Dictionary) -> Label:
	var label := Label.new()
	label.text = String(element.get("text", element.get("name", "")))
	label.clip_text = true
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_color", _color(String(element.get("textColor", "#ffffff")), Color.WHITE))
	return label


func _create_bar(element: Dictionary) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = 100
	bar.value = clampf(float(element.get("value", 70)), 0, 100)
	bar.show_percentage = false
	bar.add_theme_stylebox_override("background", _style_box("#111815", String(element.get("stroke", "#4f6157")), 2))
	bar.add_theme_stylebox_override("fill", _style_box(String(element.get("fill", "#e13d38")), String(element.get("fill", "#e13d38")), 2))
	return bar


func _create_button(element: Dictionary) -> Button:
	var button := Button.new()
	button.text = String(element.get("text", element.get("name", "")))
	_apply_button_styles(button, element)
	return button


func _create_slot(element: Dictionary) -> Button:
	var button := _create_button(element)
	button.text = String(element.get("text", ""))
	return button


func _create_minimap(element: Dictionary) -> Panel:
	return _create_panel(element)


func _apply_button_styles(button: Button, element: Dictionary) -> void:
	var fill := String(element.get("fill", "#25443b"))
	var stroke := String(element.get("stroke", "#73a890"))
	var text_color := _color(String(element.get("textColor", "#f5fff8")), Color.WHITE)
	button.add_theme_stylebox_override("normal", _style_box(fill, stroke, 3))
	button.add_theme_stylebox_override("hover", _style_box(_lighten(fill, 0.16), stroke, 3))
	button.add_theme_stylebox_override("pressed", _style_box(_darken(fill, 0.12), stroke, 3))
	button.add_theme_color_override("font_color", text_color)
	button.add_theme_color_override("font_hover_color", text_color)
	button.add_theme_color_override("font_pressed_color", text_color)


func _apply_rect(node: Control, rect: Dictionary) -> void:
	node.position = Vector2(float(rect.get("x", 0)), float(rect.get("y", 0)))
	node.size = Vector2(float(rect.get("width", 32)), float(rect.get("height", 32)))
	node.custom_minimum_size = node.size


func _style_box(fill: String, stroke: String, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = _color(fill, Color(0.08, 0.1, 0.09, 0.95))
	style.border_color = _color(stroke, Color(0.45, 0.55, 0.5, 1))
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_right = radius
	style.corner_radius_bottom_left = radius
	return style


func _color(value: String, fallback: Color) -> Color:
	if value.begins_with("#"):
		return Color.html(value)
	return fallback


func _lighten(value: String, amount: float) -> String:
	var color := _color(value, Color.WHITE)
	color = color.lightened(amount)
	return "#%s" % color.to_html(false)


func _darken(value: String, amount: float) -> String:
	var color := _color(value, Color.BLACK)
	color = color.darkened(amount)
	return "#%s" % color.to_html(false)


func _node_name(value: String, fallback: String) -> String:
	var sanitized := value.strip_edges()
	if sanitized.is_empty():
		return fallback
	var result := ""
	for part in sanitized.split("_", false):
		if part.is_empty():
			continue
		result += part.substr(0, 1).to_upper() + part.substr(1)
	return result if not result.is_empty() else fallback


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
