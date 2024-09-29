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

interface Segment {
  start: Vector<2>;
  end: Vector<2>;
  children?: Segment[];
}

interface Tree {
  created: number;
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

function createTree(now: number): Tree {
  return {
    created: now,
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

interface State {
  trees: Tree[];
}

function init({ ctx, time }: AppContext<typeof config>): State {
  ctx.fillStyle = "black";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  return {
    trees: new Array(10).fill(undefined).map(() => createTree(time.now)),
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

  ctx.beginPath();
  state.trees.forEach((tree, i) => {
    drawSegmentRecursive(
      ctx,
      tree.root,
      dimensions.with(0, ((i + 0.5) * dimensions.x()) / state.trees.length),
      time.now - tree.created
    );
  });
  ctx.stroke();

  return state;
}

export default appMethods.stateful({ init, animationFrame });
