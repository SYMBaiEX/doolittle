import { ErrorBlock, LoadingBlock } from "../lib";

export function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading) return <LoadingBlock label="Loading workbench…" />;
  if (error) return <ErrorBlock error={error} retry={retry} />;
  return null;
}
