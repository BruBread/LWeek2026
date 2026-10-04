// scene -> { deviceId: {a, v} }. Add devices/scenes here; devices map a/v to hardware.
module.exports = {
  safe:       { mask: { a: 'glow', v: 'dim' },  strip: { a: 'solid', v: '#ffffff' } },
  finale_red: { mask: { a: 'glow', v: 'red' },  strip: { a: 'solid', v: '#ff0000' } },
  dark:       { strip: { a: 'p2', v: 'idle' } },   // RESET ALL ROOMS: the hallway bulb off, ready for the next group
};
