import TokenHub from "./TokenHub";

export default function TokenHubPage({ params }: { params: { chain: string; address: string } }) {
  return <TokenHub chain={params.chain} address={params.address} />;
}
