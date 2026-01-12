(function () {
  window.util = {
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    lerp(start, end, amount) {
      return start + (end - start) * amount;
    },
    map(value, inMin, inMax, outMin, outMax) {
      return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
    },
    randRange(min, max) {
      return min + Math.random() * (max - min);
    },
    smoothstep(edge0, edge1, x) {
      const t = window.util.clamp((x - edge0) / (edge1 - edge0), 0, 1);
      return t * t * (3 - 2 * t);
    }
  };
})();
