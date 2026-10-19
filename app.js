// ============================================================
// 旅行城市推荐器 —— 匹配逻辑与界面（苹果风 Bento）
// 数据：data.js(window.CITY_DATA)、china.js(window.CHINA_GEO)、
//       geo.js(window.DEPARTURES / window.CITY_COORDS)
// ============================================================

// —— 看重程度 ——
var WEIGHT_LEVELS = [
  { label: "无所谓", value: 0 },
  { label: "纳入考虑", value: 1 },
  { label: "很重要", value: 3 }
];
var AUTHOR_WEIGHT_LEVELS = [
  { label: "不需要", value: 0 },
  { label: "纳入考虑", value: 1 },
  { label: "很重要", value: 3 }
];

// —— 景点类型 tag 分组 ——
var TAG_GROUPS = [
  { key: "mountain", label: "山",   emoji: "⛰️", tags: ["青山", "石头山", "丹霞山", "喀斯特山", "雪山"] },
  { key: "water",    label: "水",   emoji: "🌊", tags: ["江河湖", "盐湖海子", "海", "瀑布"] },
  { key: "wild",     label: "原野", emoji: "🌲", tags: ["草原", "沙漠", "湿地", "森林", "峡谷", "溶洞"] },
  { key: "culture",  label: "人文", emoji: "🏛️", tags: ["佛教", "古城古建", "红色", "园林", "水乡古镇", "文物遗迹", "民俗"] },
  { key: "urban",    label: "都市", emoji: "🌃", tags: ["夜景", "都市潮流", "赌场"] }
];
var TAG_CATEGORY = {};
TAG_GROUPS.forEach(function (g) {
  g.tags.forEach(function (t) { TAG_CATEGORY[t] = g.key; });
});
var TAG_MODE_OPTIONS = [
  { label: "一定要在上述tag里找", value: "hard" },
  { label: "tag只作为意向参考", value: "soft" }
];

// —— 目的地交通（硬性条件，三档单选） ——
var TRANSIT_OPTIONS = [
  { label: "目的地一定要像有地铁那么便捷", value: 3, hint: "对于[目的地交通]要求最高、最严格" },
  { label: "目的地不一定非得有地铁，只要有公交、旅游大巴能到景区就行", value: 2, hint: "有一定要求" },
  { label: "我能接受连公交、旅游大巴都没有，靠打车/拼车/一日团也行", value: 1, hint: "完全没要求" }
];
var BUS_OPTIONS = [
  { label: "我可以坐大巴", value: true },
  { label: "我不能坐大巴", value: false }
];
var FLY_OPTIONS = [
  { label: "我一定要坐飞机", value: true },
  { label: "我可以不坐飞机", value: false }
];

// —— 旅行天数刻度 ——
var DAY_STOPS = [
  { label: "一天往返", value: 1 },
  { label: "1-2天", value: 2 },
  { label: "1-3天", value: 3 },
  { label: "1-5天", value: 5 },
  { label: "1-7天", value: 7 },
  { label: "不限", value: null }
];

// —— 点击卡片跳转 ——
var JUMP_OPTIONS = [
  { label: "不跳转", value: "none" },
  { label: "跳转百度（电脑推荐）", value: "baidu" }
];
var jumpMode = "none";

// —— 软性维度 ——
function natureMix(c) {
  var culture = (c.culture === undefined ? 0 : c.culture);
  var nature = (c.nature === undefined ? 0 : c.nature);
  if (culture + nature <= 0) return 2.5;
  return Math.max(0, Math.min(5, 2.5 + (nature - culture) * 0.5));
}

var DIMENSIONS = [
  { key: "scenery", label: "我更倾向[人文景点]还是[自然景点]？", short: "人文/自然", left: "人文景点", right: "自然景点", scale: 5, levels: 5, get: function (c) { return natureMix(c); } },
  { key: "food", label: "我很在乎[美食]？", short: "美食", left: "没啥吃的", right: "遍地珍馐", scale: 5, levels: 5, get: function (c) { return c.food; } },
  { key: "popularity", label: "我喜欢[大众热门都市]还是[小众冷门小城]？", short: "大众/小众", left: "大众热门都市", right: "小众冷门小城", reversed: true, scale: 5, levels: 5, get: function (c) { return c.popularity; } },
  { key: "cost", label: "我去的地方[消费水平]是？", short: "消费", left: "高性价比", right: "奢华沪币", scale: 5, levels: 5, get: function (c) { return c.cost; } },
  { key: "fun", label: "我想参考[主播的游玩评价]？", short: "主播评价", left: "主播觉得不好玩", right: "主播觉得好玩", scale: 5, levels: 5, section: "author", weightLevels: AUTHOR_WEIGHT_LEVELS, get: function (c) { return c.fun; } }
];

// —— 工具 ——
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function hl(text) {
  return String(text).replace(/\[([^\]]+)\]/g, '<span class="hl">$1</span>');
}
function costLabel(v) {
  return ["", "很低", "低", "中等", "高", "很贵"][v] || v;
}
function transitLabel(v) {
  var arr = ["无交通", "仅可打车、一日团或拼车", "有便捷公交大巴", "有地铁"];
  return arr[v] !== undefined ? arr[v] : v;
}
function haversine(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// —— 默认状态 ——
function defaultPrefs() {
  var p = {};
  DIMENSIONS.forEach(function (d) {
    var want;
    if (d.options) want = d.options[Math.floor(d.options.length / 2)].value;
    else want = Math.round(((d.levels || 5) - 1) / 2);
    p[d.key] = { weight: 0, want: want };
  });
  return p;
}
function defaultFilters() {
  return {
    tagMode: "hard",
    tags: [],
    departProvince: "310000",
    departCity: "",
    departCounty: "",
    minDist: 0,
    maxDist: 6000,
    dayIdx: 5,
    canBus: true,
    mustFly: false,
    transitIdx: 2,
    transitMin: 1
  };
}

var prefs = defaultPrefs();
var filters = defaultFilters();

// —— 地理查找 ——
var AREA_BY_CODE = {};
function buildAreaLookup() {
  AREA_BY_CODE = {};
  var deps = window.DEPARTURES || [];
  deps.forEach(function (p) {
    AREA_BY_CODE[p.adcode] = p;
    (p.children || []).forEach(function (c) {
      AREA_BY_CODE[c.adcode] = c;
      (c.children || []).forEach(function (d) { AREA_BY_CODE[d.adcode] = d; });
    });
  });
}
function findProvince(adcode) {
  var deps = window.DEPARTURES || [];
  for (var i = 0; i < deps.length; i++) if (deps[i].adcode === adcode) return deps[i];
  return null;
}
function provinceIsDirect(p) {
  if (!p) return false;
  var kids = p.children || [];
  return kids.length > 0 && !(kids[0].children && kids[0].children.length > 0);
}
function currentDeparture() {
  var prov = findProvince(filters.departProvince);
  var city = null, county = null;
  if (prov && filters.departCity) {
    var kids = prov.children || [];
    for (var j = 0; j < kids.length; j++) if (kids[j].adcode === filters.departCity) { city = kids[j]; break; }
  }
  if (city && filters.departCounty) {
    var ck = city.children || [];
    for (var k = 0; k < ck.length; k++) if (ck[k].adcode === filters.departCounty) { county = ck[k]; break; }
  }
  var node = county || city || prov;
  return node ? { lng: node.lng, lat: node.lat, name: node.name } : null;
}
function cityCoord(city) {
  var coords = window.CITY_COORDS || {};
  return coords[city.name] || null;
}
function cityDistanceKm(city, dep) {
  var coord = cityCoord(city);
  if (!dep || !coord) return null;
  return haversine(dep.lat, dep.lng, coord.lat, coord.lng);
}

// —— 评分 ——
function dimensionMatch(cityVal, want, scale) {
  return Math.max(0, 1 - Math.abs(cityVal - want) / scale);
}
function wantValue(d, want) {
  if (d.options) return want;
  var levels = d.levels || 5;
  var idx = d.reversed ? (levels - 1 - want) : want;
  return idx * (d.scale / (levels - 1));
}
function tagPrefActive() {
  return filters.tagMode === "soft" && filters.tags.length > 0;
}
function cityAllTags(c) {
  return (c.cultureTags || []).concat(c.natureTags || []);
}
function hasAny(arr, sel) {
  for (var i = 0; i < sel.length; i++) {
    if (arr.indexOf(sel[i]) !== -1) return true;
  }
  return false;
}
function cityHasTag(c) {
  return hasAny(cityAllTags(c), filters.tags);
}
function scoreCity(city) {
  var sum = 0, totalW = 0;
  var detail = {};
  for (var i = 0; i < DIMENSIONS.length; i++) {
    var d = DIMENSIONS[i];
    var w = prefs[d.key].weight;
    if (w <= 0) continue;
    var m = dimensionMatch(d.get(city), wantValue(d, prefs[d.key].want), d.scale);
    sum += w * m;
    totalW += w;
    detail[d.key] = m;
  }
  if (tagPrefActive()) {
    var tm = cityHasTag(city) ? 1 : 0;
    sum += tm;
    totalW += 1;
    detail.tags = tm;
  }
  return { score: totalW > 0 ? (sum / totalW) * 100 : null, detail: detail };
}

// —— 硬过滤 ——
function passesHardFilters(city) {
  if (filters.tagMode === "hard" && filters.tags.length > 0) {
    if (!cityHasTag(city)) return false;
  }

  var dep = currentDeparture();
  var dist = cityDistanceKm(city, dep);
  if (dist != null && (dist < filters.minDist || dist > filters.maxDist)) return false;

  var dv = DAY_STOPS[filters.dayIdx].value;
  if (dv != null && city.minDays > dv) return false;

  if (!filters.canBus && city.access === "仅大巴") return false;
  if (filters.mustFly && city.access !== "有机场火车站") return false;
  if (city.transit < filters.transitMin) return false;

  return true;
}

// —— 分段选择控件 ——
function fillButton(btn, opt) {
  if (opt.emoji) {
    btn.classList.add("has-emoji");
    var em = document.createElement("span");
    em.className = "emoji";
    em.textContent = opt.emoji;
    var tx = document.createElement("span");
    tx.className = "seg-text";
    tx.textContent = opt.label;
    btn.appendChild(em);
    btn.appendChild(tx);
  } else {
    btn.textContent = opt.label;
  }
}
function makeSegmented(options, selected, onChange) {
  var seg = document.createElement("div");
  seg.className = "seg";
  options.forEach(function (opt) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "seg-btn";
    fillButton(btn, opt);
    if (opt.value === selected) btn.classList.add("active");
    btn.addEventListener("click", function () {
      var list = seg.querySelectorAll(".seg-btn");
      for (var i = 0; i < list.length; i++) list[i].classList.remove("active");
      btn.classList.add("active");
      onChange(opt.value);
    });
    seg.appendChild(btn);
  });
  return seg;
}

// —— 字段 ——
function makeField(labelHtml, control) {
  var wrap = document.createElement("div");
  wrap.className = "field";
  var lb = document.createElement("div");
  lb.className = "field-label";
  lb.innerHTML = labelHtml;
  wrap.appendChild(lb);
  wrap.appendChild(control);
  return wrap;
}

// —— 单个离散滑块（带刻度） ——
function makeSliderRow(labelHtml, stops, idx, onChange, hint, ticks) {
  var wrap = document.createElement("div");
  wrap.className = "slider";

  var head = document.createElement("div");
  head.className = "slider-head";
  var lb = document.createElement("span");
  lb.className = "slider-label";
  lb.innerHTML = labelHtml;
  var val = document.createElement("span");
  val.className = "slider-val";
  head.appendChild(lb);
  head.appendChild(val);
  wrap.appendChild(head);

  var input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = String(stops.length - 1);
  input.step = "1";
  input.value = String(idx);
  input.addEventListener("input", function () {
    idx = parseInt(input.value, 10);
    val.textContent = stops[idx].label;
    onChange(idx);
  });
  wrap.appendChild(input);

  if (ticks) {
    var t = document.createElement("div");
    t.className = "slider-ticks";
    ticks.forEach(function (tk) {
      var s = document.createElement("span");
      s.textContent = tk;
      t.appendChild(s);
    });
    wrap.appendChild(t);
  }

  if (hint) {
    var h = document.createElement("div");
    h.className = "slider-hint";
    h.textContent = hint;
    wrap.appendChild(h);
  }

  val.textContent = stops[idx].label;
  return wrap;
}

// —— 双滑块（出行距离 0-6000 公里） ——
function makeDualRange(min, max, step, lo, hi, onChange) {
  var wrap = document.createElement("div");
  wrap.className = "dual-range";

  var track = document.createElement("div");
  track.className = "track";
  var fill = document.createElement("div");
  fill.className = "range-fill";
  wrap.appendChild(track);
  wrap.appendChild(fill);

  var loIn = document.createElement("input");
  loIn.type = "range"; loIn.min = String(min); loIn.max = String(max); loIn.step = String(step); loIn.value = String(lo);
  loIn.style.zIndex = "5";
  var hiIn = document.createElement("input");
  hiIn.type = "range"; hiIn.min = String(min); hiIn.max = String(max); hiIn.step = String(step); hiIn.value = String(hi);
  hiIn.style.zIndex = "4";

  function pct(v) { return ((v - min) / (max - min)) * 100; }
  function sync() {
    var l = Math.min(lo, hi), h = Math.max(lo, hi);
    fill.style.left = pct(l) + "%";
    fill.style.width = (pct(h) - pct(l)) + "%";
  }

  loIn.addEventListener("input", function () {
    lo = parseInt(loIn.value, 10);
    if (lo > hi) { hi = lo; hiIn.value = String(hi); }
    sync();
    onChange(lo, hi);
  });
  hiIn.addEventListener("input", function () {
    hi = parseInt(hiIn.value, 10);
    if (hi < lo) { lo = hi; loIn.value = String(lo); }
    sync();
    onChange(lo, hi);
  });

  wrap.appendChild(loIn);
  wrap.appendChild(hiIn);
  sync();
  return wrap;
}

// —— 景点类型：tag 分组多选 ——
function makeTagGroup(g) {
  var box = document.createElement("div");
  box.className = "tag-group";

  var head = document.createElement("div");
  head.className = "tag-group-head";
  var em = document.createElement("span");
  em.className = "tag-emoji";
  em.textContent = g.emoji;
  var nm = document.createElement("span");
  nm.className = "tag-group-name";
  nm.textContent = g.label;
  head.appendChild(em);
  head.appendChild(nm);
  box.appendChild(head);

  var chips = document.createElement("div");
  chips.className = "chips";
  g.tags.forEach(function (tg) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = tg;
    if (filters.tags.indexOf(tg) !== -1) chip.classList.add("active");
    chip.addEventListener("click", function () {
      var idx = filters.tags.indexOf(tg);
      if (idx === -1) { filters.tags.push(tg); chip.classList.add("active"); }
      else { filters.tags.splice(idx, 1); chip.classList.remove("active"); }
      render();
    });
    chips.appendChild(chip);
  });
  box.appendChild(chips);
  return box;
}
function makeTagControl() {
  var wrap = document.createElement("div");
  TAG_GROUPS.forEach(function (g) { wrap.appendChild(makeTagGroup(g)); });

  var modeWrap = document.createElement("div");
  modeWrap.style.marginTop = "16px";

  var modeLabel = document.createElement("div");
  modeLabel.className = "field-label";
  modeLabel.textContent = "tag 筛选方式";
  modeWrap.appendChild(modeLabel);

  var hint = document.createElement("div");
  hint.className = "tag-mode-hint";
  function refreshTagHint() {
    hint.textContent = filters.tagMode === "hard" ? "精确筛选 · 只推荐含所选 tag 的城市" : "模糊筛选 · tag 仅作加分参考";
  }
  modeWrap.appendChild(makeSegmented(TAG_MODE_OPTIONS, filters.tagMode, function (v) {
    filters.tagMode = v;
    refreshTagHint();
    render();
  }));
  refreshTagHint();
  modeWrap.appendChild(hint);

  wrap.appendChild(modeWrap);
  return wrap;
}

// —— 出发地：省 / 市 / 县 ——
function makeDepartureControl() {
  var wrap = document.createElement("div");
  wrap.className = "selects";

  var selA = document.createElement("select");
  var selB = document.createElement("select");
  var selC = document.createElement("select");

  (window.DEPARTURES || []).forEach(function (p) {
    var o = document.createElement("option");
    o.value = p.adcode;
    o.textContent = p.name;
    if (p.adcode === filters.departProvince) o.selected = true;
    selA.appendChild(o);
  });

  function fillB() {
    selB.innerHTML = "";
    var prov = findProvince(filters.departProvince);
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "（" + (prov ? prov.name : "") + "全域）";
    selB.appendChild(none);
    if (!prov) return;
    (prov.children || []).forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.adcode;
      o.textContent = c.name;
      selB.appendChild(o);
    });
    if (filters.departCity) selB.value = filters.departCity;
  }

  function fillC() {
    selC.innerHTML = "";
    var prov = findProvince(filters.departProvince);
    var direct = provinceIsDirect(prov);
    var city = filters.departCity ? AREA_BY_CODE[filters.departCity] : null;
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "（" + (city ? city.name : "全域") + "）";
    selC.appendChild(none);
    if (direct || !city) { selC.style.display = "none"; return; }
    selC.style.display = "";
    (city.children || []).forEach(function (d) {
      var o = document.createElement("option");
      o.value = d.adcode;
      o.textContent = d.name;
      selC.appendChild(o);
    });
    if (filters.departCounty) selC.value = filters.departCounty;
  }

  selA.addEventListener("change", function () {
    filters.departProvince = selA.value;
    filters.departCity = "";
    filters.departCounty = "";
    fillB();
    fillC();
    render();
  });
  selB.addEventListener("change", function () {
    filters.departCity = selB.value;
    filters.departCounty = "";
    fillC();
    render();
  });
  selC.addEventListener("change", function () {
    filters.departCounty = selC.value;
    render();
  });

  fillB();
  fillC();
  wrap.appendChild(selA);
  wrap.appendChild(selB);
  wrap.appendChild(selC);
  return wrap;
}

// —— 出行距离 + 地图 ——
function makeDistanceControl() {
  var wrap = document.createElement("div");

  var valEl = document.createElement("div");
  valEl.className = "hint hint-accent";

  wrap.appendChild(makeDualRange(0, 6000, 10, filters.minDist, filters.maxDist, function (lo, hi) {
    filters.minDist = lo;
    filters.maxDist = hi;
    valEl.textContent = lo + " – " + hi + " 公里";
    render();
  }));

  var labels = document.createElement("div");
  labels.className = "dual-range-labels";
  var l0 = document.createElement("span");
  l0.textContent = "0 公里";
  var l1 = document.createElement("span");
  l1.textContent = "6000 公里";
  labels.appendChild(l0);
  labels.appendChild(l1);
  wrap.appendChild(labels);

  valEl.textContent = filters.minDist + " – " + filters.maxDist + " 公里";
  wrap.appendChild(valEl);

  return wrap;
}

// —— 目的地交通：三档单选 ——
function makeTransitControl() {
  var wrap = document.createElement("div");

  var hint = document.createElement("div");
  hint.className = "hint";

  var selected = filters.transitIdx;
  TRANSIT_OPTIONS.forEach(function (opt, i) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "opt-row" + (i === selected ? " active" : "");
    var dot = document.createElement("span");
    dot.className = "opt-dot";
    var text = document.createElement("span");
    text.className = "opt-text";
    text.innerHTML = hl(opt.label);
    row.appendChild(dot);
    row.appendChild(text);
    row.addEventListener("click", function () {
      selected = i;
      filters.transitIdx = i;
      filters.transitMin = opt.value;
      var rows = wrap.querySelectorAll(".opt-row");
      for (var k = 0; k < rows.length; k++) rows[k].classList.remove("active");
      row.classList.add("active");
      hint.innerHTML = hl(opt.hint);
      render();
    });
    wrap.appendChild(row);
  });

  hint.innerHTML = hl(TRANSIT_OPTIONS[selected].hint);
  wrap.appendChild(hint);
  return wrap;
}

// —— 维度行 ——
function makeDimRow(d) {
  var wrap = document.createElement("div");
  wrap.className = "dim";

  var label = document.createElement("div");
  label.className = "dim-label";
  label.innerHTML = hl(d.label);
  var badge = document.createElement("span");
  badge.className = "dim-badge";
  badge.textContent = "着重";
  label.appendChild(badge);
  wrap.appendChild(label);

  var control = document.createElement("div");
  control.className = "dim-control";
  var wl = d.weightLevels || WEIGHT_LEVELS;

  function applyWeight() {
    var w = prefs[d.key].weight;
    if (w <= 0) {
      control.style.display = "none";
      control.classList.remove("important");
      badge.style.display = "none";
    } else {
      control.style.display = "";
      if (w === 3) { control.classList.add("important"); badge.style.display = ""; }
      else { control.classList.remove("important"); badge.style.display = "none"; }
    }
  }

  wrap.appendChild(makeSegmented(wl, prefs[d.key].weight, function (v) {
    prefs[d.key].weight = v;
    applyWeight();
    render();
  }));

  if (d.options) {
    control.appendChild(makeSegmented(d.options, prefs[d.key].want, function (v) { prefs[d.key].want = v; render(); }));
  } else {
    var body = document.createElement("div");
    body.className = "dim-pref";
    var left = document.createElement("span");
    left.className = "endpoint";
    left.textContent = d.left;
    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String((d.levels || 5) - 1);
    slider.step = "1";
    slider.value = prefs[d.key].want;
    var right = document.createElement("span");
    right.className = "endpoint";
    right.textContent = d.right;
    slider.addEventListener("input", function () { prefs[d.key].want = parseInt(slider.value, 10); render(); });
    body.appendChild(left);
    body.appendChild(slider);
    body.appendChild(right);
    control.appendChild(body);
  }
  wrap.appendChild(control);

  if (d.hint) {
    var hintEl = document.createElement("div");
    hintEl.className = "dim-hint";
    hintEl.textContent = d.hint;
    wrap.appendChild(hintEl);
  }

  applyWeight();
  return wrap;
}

// —— 组装左侧面板 ——
function buildControls() {
  var types = document.getElementById("types");
  types.innerHTML = "";
  types.appendChild(makeTagControl());

  var trip = document.getElementById("trip");
  trip.innerHTML = "";
  trip.appendChild(makeField(hl("我的[出发地]是？"), makeDepartureControl()));
  trip.appendChild(makeField(hl("我计划的[出行距离]"), makeDistanceControl()));
  trip.appendChild(makeSliderRow(
    hl("我计划的[旅行天数]？"),
    DAY_STOPS,
    filters.dayIdx,
    function (i) { filters.dayIdx = i; render(); },
    null,
    DAY_STOPS.map(function (s) { return s.label; })
  ));
  trip.appendChild(makeField(hl("我能不能去[不通火车]的地方？"), makeSegmented(BUS_OPTIONS, filters.canBus, function (v) { filters.canBus = v; render(); })));
  trip.appendChild(makeField(hl("我能不能去[没有航班]的地方？"), makeSegmented(FLY_OPTIONS, filters.mustFly, function (v) { filters.mustFly = v; render(); })));
  trip.appendChild(makeField(hl("我对于[目的地交通]的接受程度是？"), makeTransitControl()));

  var prefsEl = document.getElementById("prefs");
  var authorEl = document.getElementById("author");
  prefsEl.innerHTML = "";
  authorEl.innerHTML = "";
  for (var i = 0; i < DIMENSIONS.length; i++) {
    var d = DIMENSIONS[i];
    (d.section === "author" ? authorEl : prefsEl).appendChild(makeDimRow(d));
  }
}

// —— 中国地图 ——
var chinaChart = null;
var lastRingKey = null;

function geoOption() {
  return {
    map: "china",
    roam: true,
    scaleLimit: { min: 0.6, max: 20 },
    itemStyle: { areaColor: "#f2f3f5", borderColor: "#d5d7db", borderWidth: 0.6 },
    emphasis: { label: { show: false }, itemStyle: { areaColor: "#e3e9f0" } },
    label: { show: false },
    selectedMode: false
  };
}

function ringCityList() {
  var dep = currentDeparture();
  var data = window.CITY_DATA || [];
  var list = [];
  if (!dep) return list;
  data.forEach(function (c) {
    var coord = cityCoord(c);
    if (!coord) return;
    var d = haversine(dep.lat, dep.lng, coord.lat, coord.lng);
    if (d >= filters.minDist && d <= filters.maxDist) {
      list.push({ name: c.name, lng: coord.lng, lat: coord.lat, dist: d });
    }
  });
  return list;
}

function refreshMap(scored) {
  if (!chinaChart) return;
  var dep = currentDeparture();
  var ring = ringCityList();
  var ringNames = {};
  ring.forEach(function (r) { ringNames[r.name] = true; });

  var top3Names = {};
  if (scored) {
    var count = 0;
    for (var i = 0; i < scored.length && count < 3; i++) {
      var n = scored[i].city.name;
      if (ringNames[n]) { top3Names[n] = true; count++; }
    }
  }

  var dotData = ring.map(function (r) {
    var isTop = !!top3Names[r.name];
    return {
      name: r.name,
      value: [r.lng, r.lat],
      symbolSize: isTop ? 11 : 7,
      label: isTop ? { show: true, position: "top", formatter: "{b}", color: "#1d1d1f", fontWeight: 700, fontSize: 10 } : { show: false }
    };
  });

  var series = [{
    name: "城市",
    type: "scatter",
    coordinateSystem: "geo",
    symbolSize: 7,
    itemStyle: { color: "#0071e3", borderColor: "#fff", borderWidth: 1 },
    label: { show: false },
    data: dotData
  }];

  if (dep) {
    series.push({
      name: "出发地",
      type: "scatter",
      coordinateSystem: "geo",
      symbol: "pin",
      symbolSize: 26,
      itemStyle: { color: "#ff3b30" },
      label: { show: true, position: "bottom", formatter: "{b}", color: "#ff3b30", fontWeight: 700, fontSize: 10 },
      data: [{ name: dep.name, value: [dep.lng, dep.lat] }]
    });
  }

  chinaChart.setOption({ series: series }, { replaceMerge: ["series"] });
  refreshRing();
}

function refreshRing() {
  if (!chinaChart) return;
  try {
    var dep = currentDeparture();
    var key = null;
    if (dep) {
      var c = chinaChart.convertToPixel({ geoIndex: 0 }, [dep.lng, dep.lat]);
      var n = chinaChart.convertToPixel({ geoIndex: 0 }, [dep.lng, dep.lat + 1]);
      if (c && n) {
        var pxPerKm = Math.abs(n[1] - c[1]) / 111;
        var r0 = Math.max(0, filters.minDist * pxPerKm);
        var r = Math.max(1, filters.maxDist * pxPerKm);
        key = [Math.round(c[0]), Math.round(c[1]), Math.round(r0), Math.round(r)].join(",");
        if (key !== lastRingKey) {
          lastRingKey = key;
          chinaChart.setOption({
            graphic: [{
              type: "ring",
              shape: { cx: c[0], cy: c[1], r: r, r0: r0 },
              style: { fill: "rgba(0,113,227,0.10)", stroke: "rgba(0,113,227,0.55)", lineWidth: 1.5 },
              z: 5,
              silent: true
            }]
          });
        }
      }
    }
    if (!key) {
      if (lastRingKey !== null) {
        lastRingKey = null;
        chinaChart.setOption({ graphic: [] });
      }
    }
  } catch (e) { /* 地图尚未就绪时忽略 */ }
}

function initChinaMap() {
  var el = document.getElementById("china-map");
  if (!el || !window.echarts || !window.CHINA_GEO) return;
  if (chinaChart) { chinaChart.dispose(); chinaChart = null; }
  lastRingKey = null;
  echarts.registerMap("china", window.CHINA_GEO);
  chinaChart = echarts.init(el);
  var geo = geoOption();
  geo.center = [104.0, 36.0];
  geo.zoom = 1.4;
  chinaChart.setOption({
    tooltip: { trigger: "item", formatter: "{b}" },
    geo: geo,
    series: []
  });
  chinaChart.on("georoam", function () { refreshRing(); });
  chinaChart.on("finished", function () { refreshRing(); });
  chinaChart.on("click", function (params) {
    if (!params || params.componentType !== "series" || params.seriesName !== "城市") return;
    var name = params.name;
    if (!name) return;
    var cards = document.querySelectorAll("#results .card");
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute("data-city") === name) {
        cards[i].scrollIntoView({ behavior: "smooth", block: "center" });
        cards[i].classList.add("flash");
        setTimeout(function (node) { return function () { node.classList.remove("flash"); }; }(cards[i]), 1600);
        break;
      }
    }
  });
}

// —— 结果渲染 ——
function fitChip(label, m) {
  var cls = m >= 0.66 ? "good" : (m >= 0.4 ? "mid" : "bad");
  var mark = m >= 0.66 ? "✓" : (m >= 0.4 ? "△" : "✗");
  return '<span class="fit ' + cls + '">' + esc(label) + ' ' + mark + '</span>';
}

function makeCard(item, i, hasPref, dep) {
  var c = item.city;
  var el = document.createElement("div");
  el.className = "card";
  el.setAttribute("data-city", c.name);

  var days = c.minDays === c.maxDays ? c.minDays + "天" : c.minDays + "-" + c.maxDays + "天";

  var scoreHtml = "";
  if (hasPref && item.score != null) {
    scoreHtml = '<div class="score">' + Math.round(item.score) + '<span class="pct">%</span></div>';
  }

  var fitHtml = "";
  if (hasPref) {
    var parts = [];
    DIMENSIONS.forEach(function (d) {
      if (prefs[d.key].weight > 0) parts.push(fitChip(d.short || d.label, item.detail[d.key]));
    });
    if (tagPrefActive()) parts.push(fitChip("景点类型", item.detail.tags));
    fitHtml = '<div class="fits">' + parts.join("") + '</div>';
  }

  var metaParts = ["建议 " + days];
  if (dep) {
    var coord = cityCoord(c);
    if (coord) metaParts.push("距" + dep.name + " " + Math.round(haversine(dep.lat, dep.lng, coord.lat, coord.lng)) + " 公里");
  }
  metaParts.push("消费 " + costLabel(c.cost));
  metaParts.push("公交 " + transitLabel(c.transit));

  var tagHtml = cityAllTags(c).map(function (t) {
    var cat = TAG_CATEGORY[t] || "";
    return '<span class="tag cat-' + cat + '">' + esc(t) + '</span>';
  }).join("");

  el.innerHTML =
    '<div class="card-top">' +
      '<div class="rank">' + (i + 1) + '</div>' +
      '<div class="name-wrap">' +
        '<div class="name">' + esc(c.name) + '</div>' +
        '<div class="province">' + esc(c.province || "") + '</div>' +
      '</div>' +
      scoreHtml +
    '</div>' +
    '<div class="meta">' + metaParts.join(" · ") + '</div>' +
    fitHtml +
    (tagHtml ? '<div class="tags">' + tagHtml + '</div>' : "") +
    (c.notes ? '<div class="notes">' + esc(c.notes) + '</div>' : "");
  return el;
}

function render() {
  var summary = document.getElementById("summary");
  var results = document.getElementById("results");
  var data = window.CITY_DATA || [];
  var dep = currentDeparture();

  var hasPref = DIMENSIONS.some(function (d) { return prefs[d.key].weight > 0; }) || tagPrefActive();

  var included = data.filter(function (c) { return passesHardFilters(c); });
  var excludedCount = data.length - included.length;

  var scored;
  if (hasPref) {
    scored = included.map(function (c) {
      var s = scoreCity(c);
      return { city: c, score: s.score, detail: s.detail };
    }).sort(function (a, b) {
      return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score);
    });
  } else {
    scored = included.map(function (c) { return { city: c, score: null, detail: {} }; })
      .sort(function (a, b) { return a.city.name.localeCompare(b.city.name, "zh"); });
  }

  var names = [];
  DIMENSIONS.forEach(function (d) { if (prefs[d.key].weight > 0) names.push(d.short || d.label); });
  if (tagPrefActive()) names.push("景点类型");
  var dimNames = names.length ? names.join("、") : "（未设置偏好，按名称排序）";

  var depText = dep ? " · 出发地 " + dep.name : "";
  summary.textContent = "共匹配 " + scored.length + " 座城市" +
    (excludedCount ? " · 已排除 " + excludedCount + " 座（硬性条件）" : "") +
    depText +
    " · 维度：" + dimNames;

  results.innerHTML = "";
  if (scored.length === 0) {
    results.innerHTML = '<div class="empty">没有符合条件的城市，试试放宽硬性条件（景色 tag / 出行距离 / 旅行天数 / 交通方式）。</div>';
  } else {
    scored.forEach(function (item, i) { results.appendChild(makeCard(item, i, hasPref, dep)); });
  }

  refreshMap(scored);
}

// —— 点击卡片跳转搜索 ——
function jumpToSearch(name) {
  if (jumpMode === "baidu") {
    window.open("https://www.baidu.com/s?wd=" + encodeURIComponent(name + " 景点"), "_blank");
  }
}

function buildJumpControl() {
  var el = document.getElementById("jumpmode");
  if (!el) return;
  el.innerHTML = "";
  var lb = document.createElement("span");
  lb.className = "jumpmode-label";
  lb.textContent = "点击卡片后：";
  el.appendChild(lb);
  el.appendChild(makeSegmented(JUMP_OPTIONS, jumpMode, function (v) { jumpMode = v; }));
}

// —— 初始化 ——
document.getElementById("reset").addEventListener("click", function () {
  prefs = defaultPrefs();
  filters = defaultFilters();
  buildControls();
  initChinaMap();
  render();
});

window.addEventListener("resize", function () {
  if (!chinaChart) return;
  chinaChart.resize();
  refreshRing();
});

buildAreaLookup();
buildControls();
buildJumpControl();
initChinaMap();
render();

document.getElementById("results").addEventListener("click", function (e) {
  var node = e.target;
  while (node && node.classList) {
    if (node.classList.contains("card")) {
      var name = node.getAttribute("data-city");
      if (name) jumpToSearch(name);
      return;
    }
    node = node.parentNode;
  }
});
