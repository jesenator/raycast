import { LaunchProps } from "@raycast/api";
import { copyNth, invalidN, parseN } from "./history";

export default async function main(props: LaunchProps<{ arguments: { n: string } }>) {
  const n = parseN(props.arguments.n);
  if (n === null) return invalidN(props.arguments.n);
  await copyNth(n);
}
