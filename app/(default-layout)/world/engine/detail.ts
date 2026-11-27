// Detail that is only worth its triangles from near by.
//
// From the page's camera a far headland is a few dark pixels; walked up to, it
// has to hold up as well as the camp does. Each place registers what it looks
// like close up, and from how far off that matters. The first time the eye
// comes within range it is built (once) and shown; beyond range it is put
// away again, so the world never draws more than what is round the visitor.
import type { Object3D, Vector3 } from 'three';

export interface DetailSpot {
  /** the middle of the place */
  at: [number, number, number];
  /** metres from `at` within which the close-up version is shown */
  within: number;
  /** Make the close-up version (add it to the scene yourself and return it). Called once, the first
   *  time the eye comes within range. Anything solid in it must be handed to the level's Solid here too. */
  build: () => Object3D | Object3D[] | void;
  /** what stands in for it from further off, if anything: hidden while the close-up version shows */
  far?: Object3D | Object3D[];
  /** called whenever it is shown or put away */
  onShow?: (shown: boolean) => void;
}

interface Entry extends DetailSpot {
  near: Object3D[] | null;
  shown: boolean;
}

const list = (o: Object3D | Object3D[] | void | undefined): Object3D[] => (!o ? [] : Array.isArray(o) ? o : [o]);

export class Detail {
  private spots: Entry[] = [];
  private next = 0;
  /** how many spots have been built so far (for the debug read-out) */
  built = 0;

  add(spot: DetailSpot) {
    this.spots.push({ ...spot, near: null, shown: false });
    return this;
  }

  /** Call every frame with where the eye is. Looks at a few spots a frame, and
   *  builds at most one, so that walking into a busy place never costs a long frame. */
  update(eye: Vector3) {
    const n = this.spots.length;
    let builtNow = false;
    for (let i = 0; i < Math.min(n, 8); i++) {
      const s = this.spots[this.next];
      this.next = (this.next + 1) % n;
      const d = Math.hypot(eye.x - s.at[0], eye.y - s.at[1], eye.z - s.at[2]);
      // (a margin on the way out, so standing at the edge of range does not flicker)
      const want = d < (s.shown ? s.within * 1.15 + 4 : s.within);
      if (want === s.shown) continue;
      if (want && !s.near) {
        if (builtNow) continue;
        s.near = list(s.build());
        this.built++;
        builtNow = true;
      }
      s.shown = want;
      for (const o of s.near ?? []) o.visible = want;
      for (const o of list(s.far)) o.visible = !want;
      s.onShow?.(want);
    }
  }

  /** Put every close-up version away (somebody stepped back out to the page). What was built stays built. */
  reset() {
    for (const s of this.spots) {
      if (!s.shown) continue;
      s.shown = false;
      for (const o of s.near ?? []) o.visible = false;
      for (const o of list(s.far)) o.visible = true;
      s.onShow?.(false);
    }
  }
}
