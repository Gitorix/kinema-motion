// Full-body anatomy view built from BodyParts3D (DBCLS, CC BY 4.0): every muscle in the data as its own mesh,
// standing in the anatomical position, with the skeleton as a faint reference. Built on first use.
window.createKinemaAtlas = function createKinemaAtlas(THREE) {
  const A = window.KINEMA_ANATOMY;
  const group = new THREE.Group();
  group.visible = false;
  const meshes = [];
  const mat = {
    muscle: new THREE.MeshStandardMaterial({ color: 0xcf7a72, roughness: 0.55, metalness: 0 }),
    faded: new THREE.MeshStandardMaterial({ color: 0xcf7a72, roughness: 0.6, transparent: true, opacity: 0.1, depthWrite: false }),
    bone: new THREE.MeshStandardMaterial({ color: 0xebe4d6, roughness: 0.7, transparent: true, opacity: 0.5, depthWrite: false }),
    hover: new THREE.MeshStandardMaterial({ color: 0x8ab8ff, emissive: 0x2f7cf6, emissiveIntensity: 0.2, roughness: 0.5 }),
  };
  const roleMat = {
    weak: new THREE.MeshStandardMaterial({ color: 0xe5484d, emissive: 0xe5484d, emissiveIntensity: 0.35, roughness: 0.45 }),
    tight: new THREE.MeshStandardMaterial({ color: 0xf5a524, emissive: 0xf5a524, emissiveIntensity: 0.3, roughness: 0.45 }),
    select: new THREE.MeshStandardMaterial({ color: 0x2f7cf6, emissive: 0x2f7cf6, emissiveIntensity: 0.35, roughness: 0.45 }),
    stab: new THREE.MeshStandardMaterial({ color: 0x12a594, emissive: 0x12a594, emissiveIntensity: 0.3, roughness: 0.45 }),
  };

  function decode(b64, Type) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Type(bytes.buffer);
  }
  function geometry(item) {
    const q = decode(item.p, Uint16Array);
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) {
      for (let k = 0; k < 3; k++) pos[i + k] = A.min[k] + q[i + k] * A.step[k];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(decode(item.i, item.i32 ? Uint32Array : Uint16Array), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  let built = false;
  function build() {
    if (built || !A) return;
    built = true;
    const bones = new THREE.Mesh(geometry(A.bones), mat.bone);
    group.add(bones);
    A.muscles.forEach((m, index) => {
      const mesh = new THREE.Mesh(geometry(m), mat.muscle);
      mesh.userData = { index };
      mesh.castShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    });
    // stand on the floor, centred under the camera target
    const box = new THREE.Box3().setFromObject(group);
    group.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    refresh();
  }

  let focus = {};
  let selected = new Set();
  let hoverIndex = null;
  function refresh() {
    const any = selected.size > 0 || Object.keys(focus).length > 0;
    meshes.forEach((mesh, i) => {
      const role = selected.has(i) ? 'select' : focus[A.muscles[i].link];
      mesh.material = role ? roleMat[role] : i === hoverIndex ? mat.hover : any ? mat.faded : mat.muscle;
    });
  }

  const center = mesh => mesh.geometry.boundingSphere.center.clone().add(group.position);

  return {
    group,
    available: !!A,
    build,
    setVisible(on) { if (on) build(); group.visible = on; },
    // map: main-muscle ids ('weak' / 'tight' / 'select'), shown on the full-body muscles linked to them;
    // picked: indices of full-body muscles chosen one by one (any number)
    setFocus(map, picked) { focus = map || {}; selected = picked || new Set(); refresh(); },
    setHover(index) {
      if (index === hoverIndex) return;
      hoverIndex = index;
      refresh();
    },
    tick(time) {
      const k = 0.28 + 0.22 * Math.sin(time * 4);
      for (const m of Object.values(roleMat)) m.emissiveIntensity = k;
    },
    // every muscle can be picked, highlighted or faded
    pick(raycaster) {
      const hits = raycaster.intersectObjects(meshes, false);
      return hits.length ? hits[0].object.userData.index : null;
    },
    centersFor(link) { return meshes.filter((m, i) => A.muscles[i].link === link).map(center); },
    centerOf(index) { return meshes[index] ? center(meshes[index]) : null; },
  };
};
