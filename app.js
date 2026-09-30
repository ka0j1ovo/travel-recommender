// ============================================================
// 旅行城市推荐器 —— 匹配逻辑与界面
// 数据在 data.js（window.CITY_DATA），这里只负责筛选、评分、渲染。
// ============================================================

// —— 看重程度：三档 ——
var WEIGHT_LEVELS = [
  { label: "无所谓", value: 0 },
  { label: "纳入考虑", value: 1 },
  { label: "很重要", value: 3 }
];

// —— 软性维度 ——
// 人文/自然：由 culture + nature 合成一个 0-5 的光谱（0=纯人文，5=纯自然，2.5=都有）
function natureMix(c) {
  var culture = (c.culture === undefined ? 0 : c.culture);
  var nature = (c.nature === undefined ? 0 : c.nature);
  if (culture + nature <= 0) return 2.5;
  return Math.max(0, Math.min(5, 2.5 + (nature - culture) * 0.5));
}

var DIMENSIONS = [
  { key: "scenery",    label: "人文/自然", left: "人文", right: "自然", scale: 5, levels: 5, get: function (c) { return natureMix(c); } },
  { key: "food",       label: "美食",       left: "不需要美食", right: "直奔美食", scale: 5, levels: 5, get: function (c) { return c.food; } },
  { key: "popularity", label: "传统/小众",  left: "小众宝藏小城", right: "传统旅游城市", scale: 5, levels: 5, get: function (c) { return c.popularity; } },
  { key: "vibe",       label: "繁华/市井",  left: "市井烟火气", right: "繁华感", scale: 5, levels: 5, get: function (c) { return c.vibe; } },
  { key: "cost",       label: "消费水平",    left: "爽花", right: "沪币", scale: 5, levels: 5, get: function (c) { return c.cost; } },
  { key: "transit",    label: "公交便捷",    scale: 3, options: [
      { label: "无交通", emoji: "😣" },
      { label: "仅可靠打车或一日团", emoji: "😕" },
      { label: "有便捷公交大巴", emoji: "🙂" },
      { label: "有地铁", emoji: "😄" }
    ], get: function (c) { return c.transit; } }
];

// —— 想看什么 tag ——
var CULTURE_TAGS = ["佛教", "古城古建", "红色", "园林", "水乡古镇", "文物遗迹", "民俗"];
var NATURE_TAGS = ["山", "雪山", "河湖", "草原", "盐湖", "海", "沙漠", "湿地", "森林", "瀑布", "溶洞", "峡谷"];

// —— 到达方式 ——
var ACCESS_OPTIONS = [
  { label: "不限", value: null },
  { label: "当地有机场火车站", value: "有机场火车站", emoji: "😊" },
  { label: "当地仅火车站", value: "仅火车站", emoji: "😐" },
  { label: "火车站机场都没有（仅大巴）", value: "仅大巴", emoji: "😞" }
];

// 是否上海出发
var FROM_OPTIONS = [
  { label: "上海出发", value: true },
  { label: "非上海出发", value: false }
];

// 上海出发最长时间（单滑块）
var TIME_STOPS = [
  { label: "1小时", value: 1 },
  { label: "3小时", value: 3 },
  { label: "5小时", value: 5 },
  { label: "12小时", value: 12 },
  { label: "1天", value: 24 },
  { label: "不限", value: null }
];

// 最多可用天数（单滑块）
var DAY_STOPS = [
  { label: "一日往返", value: 1 },
  { label: "两日往返", value: 2 },
  { label: "3天", value: 3 },
  { label: "5天", value: 5 },
  { label: "一周", value: 7 },
  { label: "不限", value: null }
];

function defaultPrefs() {
  var p = {};
  for (var i = 0; i < DIMENSIONS.length; i++) {
    var d = DIMENSIONS[i];
    var levels = d.options ? d.options.length : (d.levels || 5);
    p[d.key] = { weight: 0, want: Math.round((levels - 1) / 2) };
  }
  return p;
}
function defaultFilters() {
  return { access: null, cultureSel: [], natureSel: [], fromSH: true, timeIdx: 5, dayIdx: 5 };
}

var prefs = defaultPrefs();
var filters = defaultFilters();

// —— 评分 ——
function dimensionMatch(cityVal, want, scale) {
  return Math.max(0, 1 - Math.abs(cityVal - want) / scale);
}
function wantValue(d, want) {
  var levels = d.options ? d.options.length : (d.levels || 5);
  return want * (d.scale / (levels - 1));
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
  return { score: totalW > 0 ? (sum / totalW) * 100 : null, detail: detail };
}

// —— 硬过滤 ——
function hasAny(arr, sel) {
  for (var i = 0; i < sel.length; i++) {
    if (arr.indexOf(sel[i]) !== -1) return true;
  }
  return false;
}
function passesHardFilters(city) {
  // 到达方式
  if (filters.access && city.access !== filters.access) return false;

  // 想看什么：人文tag / 自然tag，各自多选命中任一即可；两类之间是「且」
  if (filters.cultureSel.length > 0 && !hasAny(city.cultureTags || [], filters.cultureSel)) return false;
  if (filters.natureSel.length > 0 && !hasAny(city.natureTags || [], filters.natureSel)) return false;

  // 上海出发最长时间（非上海出发不筛选）
  if (filters.fromSH) {
    var tv = TIME_STOPS[filters.timeIdx].value;
    if (tv != null && city.fromShanghai.hours > tv) return false;
  }

  // 最多可用天数
  var dv = DAY_STOPS[filters.dayIdx].value;
  if (dv != null && city.minDays > dv) return false;

  return true;
}

// —— 工具 ——
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function costLabel(v) {
  return ["", "很低", "低", "中等", "高", "很贵"][v] || v;
}
function transitLabel(v) {
  var arr = ["无交通", "仅可靠打车或一日团", "有便捷公交大巴", "有地铁"];
  return arr[v] !== undefined ? arr[v] : v;
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

function makeHardRow(label, control) {
  var wrap = document.createElement("div");
  wrap.className = "hard-row";
  var lb = document.createElement("div");
  lb.className = "hard-label";
  lb.textContent = label;
  wrap.appendChild(lb);
  wrap.appendChild(control);
  return wrap;
}

// —— 单个离散滑块（可带说明文字） ——
function makeSliderRow(label, stops, idx, onChange, hint) {
  var wrap = document.createElement("div");
  wrap.className = "slider";

  var head = document.createElement("div");
  head.className = "slider-head";
  var lb = document.createElement("span");
  lb.className = "slider-label";
  lb.textContent = label;
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

  if (hint) {
    var hintEl = document.createElement("div");
    hintEl.className = "slider-hint";
    hintEl.textContent = hint;
    wrap.appendChild(hintEl);
  }

  val.textContent = stops[idx].label;
  return wrap;
}

// —— 想看什么：人文tag / 自然tag 多选（常驻） ——
function makeChipGroup(title, tagList, sel) {
  var box = document.createElement("div");
  box.className = "tag-group";

  var lab = document.createElement("div");
  lab.className = "type-tag-label";
  lab.textContent = title;
  box.appendChild(lab);

  var chips = document.createElement("div");
  chips.className = "chips";
  tagList.forEach(function (tg) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = tg;
    if (sel.indexOf(tg) !== -1) chip.classList.add("active");
    chip.addEventListener("click", function () {
      var idx = sel.indexOf(tg);
      if (idx === -1) { sel.push(tg); chip.classList.add("active"); }
      else { sel.splice(idx, 1); chip.classList.remove("active"); }
      render();
    });
    chips.appendChild(chip);
  });
  box.appendChild(chips);
  return box;
}

function makeTagControl() {
  var wrap = document.createElement("div");
  wrap.className = "hard-row";

  var label = document.createElement("div");
  label.className = "hard-label";
  label.textContent = "想看什么？";
  wrap.appendChild(label);

  wrap.appendChild(makeChipGroup("人文tag", CULTURE_TAGS, filters.cultureSel));
  wrap.appendChild(makeChipGroup("自然tag", NATURE_TAGS, filters.natureSel));

  return wrap;
}

function makeFromControl() {
  var wrap = document.createElement("div");
  wrap.className = "hard-row";

  var label = document.createElement("div");
  label.className = "hard-label";
  label.textContent = "是否上海出发？";
  wrap.appendChild(label);

  wrap.appendChild(makeSegmented(FROM_OPTIONS, filters.fromSH, function (v) {
    filters.fromSH = v;
    refreshFrom();
    render();
  }));

  var sliderBox = document.createElement("div");
  sliderBox.className = "from-slider";
  wrap.appendChild(sliderBox);

  function refreshFrom() {
    sliderBox.innerHTML = "";
    if (filters.fromSH) {
      sliderBox.appendChild(makeSliderRow("上海出发最长时间", TIME_STOPS, filters.timeIdx, function (i) { filters.timeIdx = i; render(); }));
    }
  }

  refreshFrom();
  return wrap;
}

function makeDimRow(d) {
  var wrap = document.createElement("div");
  wrap.className = "dim";

  var label = document.createElement("div");
  label.className = "dim-label";
  label.textContent = d.label;
  var badge = document.createElement("span");
  badge.className = "dim-badge";
  badge.textContent = "着重";
  label.appendChild(badge);
  wrap.appendChild(label);

  // 偏好控件容器（无所谓时隐藏，很重要时左侧高亮条 + 「着重」徽标）
  var control = document.createElement("div");
  control.className = "dim-control";

  function applyWeight() {
    var w = prefs[d.key].weight;
    if (w <= 0) {
      control.style.display = "none";
      control.classList.remove("important");
      badge.style.display = "none";
    } else {
      control.style.display = "";
      if (w === 3) {
        control.classList.add("important");
        badge.style.display = "";
      } else {
        control.classList.remove("important");
        badge.style.display = "none";
      }
    }
  }

  // 看重程度（三档，同一行）
  wrap.appendChild(makeSegmented(WEIGHT_LEVELS, prefs[d.key].weight, function (v) {
    prefs[d.key].weight = v;
    applyWeight();
    render();
  }));

  // 偏好控件：离散维度用选项组，连续维度用五档滑块
  if (d.options) {
    control.appendChild(makeSegmented(
      d.options.map(function (opt, i) { return { label: opt.label, value: i, emoji: opt.emoji }; }),
      prefs[d.key].want,
      function (v) { prefs[d.key].want = v; render(); }
    ));
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

  applyWeight();
  return wrap;
}

function buildControls() {
  var hardEl = document.getElementById("hardFilters");
  hardEl.innerHTML = "";
  hardEl.appendChild(makeTagControl());
  hardEl.appendChild(makeHardRow("到达方式", makeSegmented(ACCESS_OPTIONS, filters.access, function (v) { filters.access = v; render(); })));
  hardEl.appendChild(makeFromControl());
  hardEl.appendChild(makeSliderRow("最多可用天数", DAY_STOPS, filters.dayIdx, function (i) { filters.dayIdx = i; render(); }));

  var dimsEl = document.getElementById("dims");
  dimsEl.innerHTML = "";
  for (var i = 0; i < DIMENSIONS.length; i++) dimsEl.appendChild(makeDimRow(DIMENSIONS[i]));
}

// —— 结果渲染 ——
function makeCard(item, i, hasPref) {
  var c = item.city;
  var el = document.createElement("div");
  el.className = "card";

  var travel = esc(c.fromShanghai.mode) + " " + c.fromShanghai.hours + "h";
  var days = c.minDays === c.maxDays ? c.minDays + " 天" : c.minDays + "-" + c.maxDays + " 天";

  var scoreHtml = "";
  if (hasPref && item.score != null) {
    scoreHtml = '<div class="score">' + Math.round(item.score) + '<span class="pct">%</span></div>';
  }

  var fitHtml = "";
  if (hasPref) {
    var active = DIMENSIONS.filter(function (d) { return prefs[d.key].weight > 0; });
    var parts = active.map(function (d) {
      var m = item.detail[d.key];
      var cls = m >= 0.66 ? "good" : (m >= 0.4 ? "mid" : "bad");
      var mark = m >= 0.66 ? "✓" : (m >= 0.4 ? "△" : "✗");
      return '<span class="fit ' + cls + '">' + d.label + ' ' + mark + '</span>';
    });
    fitHtml = '<div class="fits">' + parts.join("") + '</div>';
  }

  var cultureTagHtml = (c.cultureTags || []).map(function (t) { return '<span class="tag culture">' + esc(t) + '</span>'; }).join("");
  var natureTagHtml = (c.natureTags || []).map(function (t) { return '<span class="tag nature">' + esc(t) + '</span>'; }).join("");
  var tagHtml = cultureTagHtml + natureTagHtml;

  el.innerHTML =
    '<div class="card-top">' +
      '<div class="rank">' + (i + 1) + '</div>' +
      '<div class="name-wrap">' +
        '<div class="name">' + esc(c.name) + '</div>' +
        '<div class="province">' + esc(c.province || "") + '</div>' +
      '</div>' +
      scoreHtml +
    '</div>' +
    '<div class="meta">上海出发 ' + travel + ' · 建议 ' + days + ' · 消费 ' + costLabel(c.cost) + ' · 公交 ' + transitLabel(c.transit) + '</div>' +
    fitHtml +
    (tagHtml ? '<div class="tags">' + tagHtml + '</div>' : "") +
    (c.notes ? '<div class="notes">' + esc(c.notes) + '</div>' : "");
  return el;
}

function render() {
  var summary = document.getElementById("summary");
  var results = document.getElementById("results");
  var data = window.CITY_DATA || [];

  var hasPref = DIMENSIONS.some(function (d) { return prefs[d.key].weight > 0; });

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

  var dimNames = hasPref
    ? DIMENSIONS.filter(function (d) { return prefs[d.key].weight > 0; }).map(function (d) { return d.label; }).join("、")
    : "（未设置偏好，按名称排序）";
  summary.textContent = "共匹配 " + scored.length + " 座城市" +
    (excludedCount ? " · 已排除 " + excludedCount + " 座（硬性条件）" : "") +
    " · 维度：" + dimNames;

  results.innerHTML = "";
  if (scored.length === 0) {
    results.innerHTML = '<div class="empty">没有符合条件的城市，试试放宽硬性条件（想看什么 / 到达方式 / 出发时间 / 天数）。</div>';
    return;
  }
  scored.forEach(function (item, i) { results.appendChild(makeCard(item, i, hasPref)); });
}

// —— 初始化 ——
document.getElementById("reset").addEventListener("click", function () {
  prefs = defaultPrefs();
  filters = defaultFilters();
  buildControls();
  render();
});

buildControls();
render();
