import { randRange } from "@web-art/core";
import { Vector } from "@web-art/linear-algebra";
import config from "./config";
import { AppContext, AppContextWithState, appMethods } from "./lib/types";

const branchChance = 0.1;
const maxBranches = 2;
const maxGrowth = 500;
const growthPerSecond = 30;
const minSegmentLength = 30;
const maxSegmentLength = 60;
const minAge = 10;
const maxAge = 20;
const maxAngleOffset = Math.PI / 6;
const preferredDirInfluence = 0.5;
const treesOnScreen = 10;
const viewShiftSpeed = 0.01;

interface Segment {
  start: Vector<2>;
  end: Vector<2>;
  children?: Segment[];
}

interface Tree {
  created: number;
  xPercent: number;
  maxAge: number;
  root: Segment;
}

function createSegment(parent: Segment, preferredDir: Vector<2>): Segment {
  return {
    start: parent.end,
    end: Vector.UP.setAngle(
      maxAngleOffset * (2 * Math.random() - 1) +
        parent.end.copy().sub(parent.start).getAngle()
    )
      .lerp(preferredDir, Math.pow(Math.random(), 1 / preferredDirInfluence))
      .setMagnitude(randRange(minSegmentLength, maxSegmentLength))
      .add(parent.end),
  };
}

function createSegmentsRecursive(
  parent: Segment,
  maxGrowth: number,
  preferredDir: Vector<2>
): Segment {
  const segment = createSegment(parent, preferredDir);
  const length = segment.start.distTo(segment.end);
  if (length > maxGrowth) {
    return segment;
  } else {
    return {
      ...segment,
      children: new Array(
        1 +
          new Array<number>(maxBranches)
            .fill(branchChance)
            .reduce((acc, curr) => acc + Number(Math.random() < curr), 0)
      )
        .fill(undefined)
        .map((_, i) =>
          createSegmentsRecursive(
            segment,
            (maxGrowth - length) * (i === 0 ? 1 : 0.4),
            i === 0
              ? preferredDir
              : Vector.UP.lerp(
                  parent.end.x() > parent.start.x()
                    ? Vector.RIGHT
                    : Vector.LEFT,
                  Math.random() ** 0.25
                )
          )
        ),
    };
  }
}

function createTree(created: number, xPercent: number): Tree {
  return {
    created,
    xPercent,
    maxAge: randRange(minAge, maxAge),
    root: createSegmentsRecursive(
      { start: Vector.DOWN, end: Vector.zero(2) },
      maxGrowth * (1 - Math.random() * 0.2),
      Vector.UP
    ),
  };
}

function drawSegmentRecursive(
  ctx: CanvasRenderingContext2D,
  segment: Segment,
  offset: Vector<2>,
  age: number
): void {
  const length = segment.start.distTo(segment.end);
  const timeToGrow = length / growthPerSecond;

  ctx.moveTo(segment.start.x() + offset.x(), segment.start.y() + offset.y());
  if (timeToGrow <= age) {
    ctx.lineTo(segment.end.x() + offset.x(), segment.end.y() + offset.y());
    segment.children?.forEach(child => {
      drawSegmentRecursive(ctx, child, offset, age - timeToGrow);
    });
  } else {
    const endPos = segment.start.lerp(segment.end, age / timeToGrow);
    ctx.lineTo(endPos.x() + offset.x(), endPos.y() + offset.y());
  }
}

function checkSegmentsInBounds(segment: Segment, xOffset: number): boolean {
  return (
    segment.start.x() + xOffset > 0 ||
    segment.end.x() + xOffset > 0 ||
    (segment.children?.some(child => checkSegmentsInBounds(child, xOffset)) ??
      false)
  );
}

interface State {
  trees: Tree[];
}

function init({ ctx, time }: AppContext<typeof config>): State {
  ctx.fillStyle = "black";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  return {
    trees: new Array(treesOnScreen)
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
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const dimensions = Vector.create(canvas.width, canvas.height);

  const lastTree = state.trees[state.trees.length - 1];
  if (
    lastTree != null &&
    time.now - lastTree.created > 1 / (treesOnScreen * viewShiftSpeed)
  ) {
    state.trees.push(createTree(time.now, 1));
  }

  const trees = state.trees
    .map(tree => ({
      ...tree,
      xPercent: tree.xPercent - viewShiftSpeed * time.delta,
    }))
    .filter(tree =>
      checkSegmentsInBounds(tree.root, dimensions.x() * tree.xPercent)
    );

  ctx.beginPath();
  trees.forEach(tree => {
    drawSegmentRecursive(
      ctx,
      tree.root,
      dimensions.with(0, dimensions.x() * tree.xPercent),
      time.now - tree.created
    );
  });
  ctx.stroke();

  return { ...state, trees };
}

export default appMethods.stateful({ init, animationFrame });
