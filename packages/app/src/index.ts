import { Option, randRange, tuple } from "@web-art/core";
import { Vector } from "@web-art/linear-algebra";
import config from "./config";
import { AppContext, AppContextWithState, appMethods } from "./lib/types";
import { createNoise2D } from "simplex-noise";

// Global
const viewShiftSpeed = 0.03;

// Trees
const branchChance = 0.1;
const maxBranches = 2;
const maxGrowth = 1;
const growthPerSecond = 0.04;
const minSegmentLength = 0.06;
const maxSegmentLength = 0.12;
const minAge = 0.02;
const maxAge = 0.04;
const maxAngleOffset = Math.PI / 6;
const preferredDirInfluence = 0.5;
const treeSpacingMultiplier = 0.25;
const colorSize = 0.03;
const treePalette = [
  "97729B",
  "99A39A",
  "4D917F",
  "F9EFF7",
  "D9D4CE",
  "CCC3B4",
  "B3B69B",
];
const minRadiusMultiplier = 0.006;
const maxRadiusMultiplier = 0.04;

// Leaves

const minLeafDistFromEnd = 0.1;
const maxLeafDistFromEnd = 0.25;
const leafAngleMin = Math.PI / 6;
const leafAngleMax = Math.PI / 2;
const leafSpacingMin = 0.01;
const leafSpacingMax = 0.03;
const leafFallSpeed = 2;
const leafSidewaysFallSpeed = 0.02;
const leafSidewaysFallOffset = 0.03;
const leafWidthMultiplier = 0.01;
const leafLengthMultiplier = 0.01;
const leafPalette = [
  "A97921",
  "ECDB8A",
  "BEB662",
  "ECE5C8",
  "CDD0BD",
  "B0924A",
];

// background
const noiseScale = 0.0013;
const backgroundIncrements = 100;
const backgroundPalette = [
  "845537",
  "BCA269",
  "575678",
  "9B6D56",
  "6F7A74",
  "867A8E",
  "7B8C82",
  "BED6E0",
];

const noise2D = createNoise2D();

interface Leaf {
  color: string;
  segmentPercent: number;
  angle: number;
  pos: Vector<2>;
  distFromEnd: number;
}

interface Segment {
  start: Vector<2>;
  end: Vector<2>;
  length: number;
  maxLeafDist: number;
  colorStops: [number, string][];
  widthMultiplier: number;
  children?: Segment[];
  leaves: Leaf[];
}

interface Tree {
  created: number;
  xPercent: number;
  maxAge: number;
  root: Segment;
  maxX: number;
}

function randChoice<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createSegment(
  parent: Segment,
  preferredDir: Vector<2>,
  widthMultiplier: number
): Segment {
  const length = randRange(minSegmentLength, maxSegmentLength);
  const lastParentColorStop = parent.colorStops[parent.colorStops.length - 1];
  const colorStopOffset =
    lastParentColorStop != null
      ? parent.length * (1 - lastParentColorStop[0])
      : 0;

  const start = parent.end;
  const end = Vector.UP.setAngle(
    maxAngleOffset * (2 * Math.random() - 1) +
      parent.end.copy().sub(parent.start).getAngle()
  )
    .lerp(preferredDir, Math.pow(Math.random(), 1 / preferredDirInfluence))
    .setMagnitude(length)
    .add(start);
  const segmentAngle = end.copy().sub(start).getAngle();

  const leaves: Leaf[] = [];
  let lastLeafOffset = Option.some(parent.leaves[parent.leaves.length - 1])
    .map(leaf => (leaf.segmentPercent - 1) * parent.length)
    .getOrElse(() => 0);

  // while (length > lastLeafOffset + leafSpacing) {
  while (length > lastLeafOffset + (leafSpacingMin + leafSpacingMax) / 2) {
    const segmentOffset = Math.min(
      lastLeafOffset + randRange(leafSpacingMin, leafSpacingMax),
      length
    );
    const leaf: Leaf = {
      color: randChoice(leafPalette) ?? "brown",
      segmentPercent: segmentOffset / length,
      pos: start.lerp(end, segmentOffset / length),
      distFromEnd: randRange(minLeafDistFromEnd, maxLeafDistFromEnd),
      angle:
        segmentAngle +
        Math.sign(Math.random() - 0.5) * randRange(leafAngleMin, leafAngleMax),
    };
    leaves.push(leaf);
    lastLeafOffset = segmentOffset;
  }

  return {
    length,
    widthMultiplier,
    start,
    end,
    leaves,
    maxLeafDist: length,
    colorStops: new Array(Math.ceil((length - colorStopOffset) / colorSize))
      .fill(undefined)
      .map((_, i) =>
        tuple(
          (i * colorSize + colorStopOffset) / length,
          randChoice(treePalette) ?? "white"
        )
      ),
  };
}

function createSegmentsRecursive(
  parent: Segment,
  maxGrowth: number,
  preferredDir: Vector<2>,
  widthMultiplier: number
): [Segment, number] {
  const segment = createSegment(parent, preferredDir, widthMultiplier);
  const maxX = Math.max(segment.start.x(), segment.end.x());
  if (segment.length > maxGrowth) {
    return [segment, maxX];
  } else {
    let numBranches = 1;
    for (let i = 0; i < maxBranches; i++) {
      numBranches += Number(Math.random() < branchChance);
    }
    const parentDir =
      parent.end.x() > parent.start.x() ? Vector.RIGHT : Vector.LEFT;
    const children = new Array(numBranches)
      .fill(undefined)
      .map((_, i) =>
        i === 0
          ? createSegmentsRecursive(
              segment,
              maxGrowth - segment.length,
              preferredDir,
              segment.widthMultiplier
            )
          : createSegmentsRecursive(
              segment,
              (maxGrowth - segment.length) * 0.4,
              Vector.UP.lerp(parentDir, Math.random() ** 0.25),
              (segment.widthMultiplier * 0.3) ** 0.5
            )
      );
    return [
      {
        ...segment,
        children: children.map(([seg]) => seg),
        maxLeafDist:
          segment.maxLeafDist +
          children.reduce(
            (max, [child]) => Math.max(max, child.maxLeafDist),
            0
          ),
      },
      Math.max(maxX, ...children.map(([_, x]) => x)),
    ];
  }
}

function createTree(created: number, xPercent: number): Tree {
  const [root, maxX] = createSegmentsRecursive(
    {
      start: Vector.DOWN,
      end: Vector.zero(2),
      length: 1,
      maxLeafDist: 0,
      widthMultiplier: 1,
      colorStops: [],
      leaves: [],
    },
    maxGrowth * (1 - Math.random() * 0.2),
    Vector.UP,
    1
  );
  return {
    created,
    xPercent,
    root,
    maxX,
    maxAge: randRange(minAge, maxAge),
  };
}

function drawSegmentRecursive({
  ctx,
  segment,
  parent,
  offset,
  age,
  scale,
}: {
  ctx: CanvasRenderingContext2D;
  segment: Segment;
  parent?: Segment;
  offset: Vector<2>;
  age: number;
  scale: number;
}): void {
  const drawStart = segment.start.copy().multiply(scale).add(offset);
  const drawEnd = segment.end.copy().multiply(scale).add(offset);

  const maxGrowthAge = Math.min(age, segment.maxLeafDist / growthPerSecond);

  const timeToGrow = segment.length / growthPerSecond;
  const drawEndLerped =
    maxGrowthAge < timeToGrow
      ? drawStart.lerp(drawEnd, maxGrowthAge / timeToGrow)
      : drawEnd;

  const gradient = ctx.createLinearGradient(
    drawStart.x(),
    drawStart.y(),
    drawEnd.x(),
    drawEnd.y()
  );
  const lastParentColor = parent?.colorStops[parent.colorStops.length - 1]?.[1];
  const firstStop = segment.colorStops[0]?.[0];
  if (lastParentColor != null && firstStop != null && firstStop > 0) {
    gradient.addColorStop(firstStop, `#${lastParentColor}`);
  }
  segment.colorStops.forEach(([stop, col], i) => {
    gradient.addColorStop(stop, `#${col}`);
    const nextStop = segment.colorStops[i + 1]?.[0];
    if (nextStop != null) {
      gradient.addColorStop(nextStop, `#${col}`);
    }
  });

  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(
    1,
    Math.min((segment.maxLeafDist + segment.widthMultiplier) / 1.5, 1) *
      scale *
      (minRadiusMultiplier +
        ((maxRadiusMultiplier - minRadiusMultiplier) *
          maxGrowthAge *
          growthPerSecond) /
          maxGrowth)
  );

  ctx.beginPath();
  ctx.moveTo(drawStart.x(), drawStart.y());
  ctx.lineTo(drawEndLerped.x(), drawEndLerped.y());
  ctx.stroke();

  const maxDistFromEnd = Math.min(segment.maxLeafDist, age * growthPerSecond);

  for (const leaf of segment.leaves) {
    if (leaf.segmentPercent <= age / timeToGrow) {
      const distFromEnd =
        leaf.segmentPercent * segment.length -
        (maxDistFromEnd - leaf.distFromEnd);
      const leafYPos = Math.min(
        leaf.pos.y() -
          (leaf.segmentPercent * segment.length -
            (age * growthPerSecond - leaf.distFromEnd)) *
            leafFallSpeed,
        0
      );
      const leafDrawPos = (
        distFromEnd > 0
          ? leaf.pos
          : Vector.create(
              leaf.pos.x() +
                Math.sin(
                  scale * leafSidewaysFallSpeed * (leaf.pos.y() - leafYPos)
                ) /
                  (scale * leafSidewaysFallOffset),
              leafYPos
            )
      )
        .copy()
        .multiply(scale)
        .add(offset)
        .min(
          Vector.create(Infinity, offset.y() - scale * leafLengthMultiplier)
        );
      const leafEnd = leafDrawPos
        .copy()
        .add(
          Vector.create(scale * leafLengthMultiplier, 0).setAngle(leaf.angle)
        );

      ctx.strokeStyle = `#${leaf.color}`;
      ctx.lineWidth = leafWidthMultiplier * scale;
      ctx.beginPath();
      ctx.moveTo(leafDrawPos.x(), leafDrawPos.y());
      ctx.lineTo(leafEnd.x(), leafEnd.y());
      ctx.stroke();
    }
  }

  if (age > timeToGrow) {
    segment.children?.forEach(child => {
      drawSegmentRecursive({
        ctx,
        offset,
        scale,
        parent: segment,
        segment: child,
        age: age - timeToGrow,
      });
    });
  }
}

interface State {
  trees: Tree[];
}

function init({ time, canvas }: AppContext<typeof config>): State {
  return {
    trees: new Array(
      Math.floor(canvas.width / (canvas.height * treeSpacingMultiplier))
    )
      .fill(undefined)
      .map((_, i, arr) =>
        createTree(
          time.now -
            ((arr.length - 1 - i) / (arr.length - 1)) *
              (maxGrowth / growthPerSecond),
          i / (arr.length - 1)
        )
      ),
  };
}

function animationFrame({
  state,
  canvas,
  ctx,
  time,
}: AppContextWithState<typeof config, State>): State {
  const dimensions = Vector.create(canvas.width, canvas.height);

  const lastTree = state.trees[state.trees.length - 1];
  if (
    lastTree == null ||
    dimensions.x() * (1 - lastTree.xPercent) >
      dimensions.y() * treeSpacingMultiplier
  ) {
    state.trees.push(createTree(time.now, 1));
  }

  const scale = dimensions.y() * 0.8;

  const trees = state.trees
    .map(tree => ({
      ...tree,
      xPercent:
        tree.xPercent -
        (viewShiftSpeed * time.delta * 4 * treeSpacingMultiplier) /
          (dimensions.x() / dimensions.y()),
    }))
    .filter(tree => tree.maxX * scale + dimensions.x() * tree.xPercent > 0);

  const noiseMultiplier =
    (viewShiftSpeed * treeSpacingMultiplier * time.now) /
    (4 * (dimensions.y() / dimensions.x()));
  const backgroundOffset = (1 / backgroundPalette.length) * scale * 0.8;
  for (let i = backgroundPalette.length - 1; i >= 0; i--) {
    ctx.fillStyle = `#${backgroundPalette[i]}`;

    if (i === backgroundPalette.length - 1) {
      ctx.fillRect(0, 0, dimensions.x(), dimensions.y());
    } else {
      const yLine = (1 - (i + 1) / backgroundPalette.length) * dimensions.y();

      ctx.beginPath();
      ctx.moveTo(dimensions.x(), dimensions.y());
      ctx.lineTo(0, dimensions.y());
      for (let j = 0; j < backgroundIncrements; j++) {
        const xPos = (dimensions.x() * j) / (backgroundIncrements - 1);
        const noiseOffset = noise2D(
          noiseScale * xPos +
            (backgroundPalette.length - i - 1) * noiseMultiplier,
          yLine
        );
        ctx.lineTo(xPos, yLine + noiseOffset * backgroundOffset);
      }
      ctx.fill();
    }
  }

  trees.forEach(tree => {
    drawSegmentRecursive({
      ctx,
      scale,
      segment: tree.root,
      offset: dimensions.with(0, dimensions.x() * tree.xPercent),
      age: time.now - tree.created,
    });
  });

  return { ...state, trees };
}

export default appMethods.stateful({ init, animationFrame });
