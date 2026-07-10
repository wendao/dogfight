Component({
  properties: {
    // 每格: '' | sky | hitb | hith | sil | silhead | pvok | pvbad
    cells: {
      type: Array,
      value: new Array(100).fill(''),
    },
    lastShot: {
      type: Number,
      value: -1,
    },
    locked: {
      type: Boolean,
      value: false,
    },
    popIdx: {
      type: Number,
      value: -1,
    },
  },
  methods: {
    onTap(e) {
      if (this.data.locked) return;
      const i = +e.currentTarget.dataset.i;
      this.triggerEvent('celltap', { i });
    },
  },
});
