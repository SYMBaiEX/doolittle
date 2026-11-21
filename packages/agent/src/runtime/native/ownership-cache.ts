import type { AppServices } from "../../services/index";
import type { GatewayConfig } from "../../types/gateway";
import type { EnvConfig } from "../../types/runtime/index";
import {
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
} from "./service-bridge/ownership";
import type { RuntimeLike } from "./service-bridge/runtime";

type NativeOwnershipControlPlane = ReturnType<
  typeof getNativeOwnershipControlPlane
>;
type NativeOwnershipSnapshot = Awaited<
  ReturnType<typeof getNativeOwnershipSnapshot>
>;

export class NativeOwnershipCache {
  private runtime?: RuntimeLike;
  private services?: AppServices;
  private gatewayConfig: GatewayConfig;
  private controlPlaneCache?: NativeOwnershipControlPlane;
  private snapshotValue?: NativeOwnershipSnapshot;
  private snapshotPromise?: Promise<NativeOwnershipSnapshot>;

  constructor(
    private readonly config: EnvConfig,
    gatewayConfig: GatewayConfig,
  ) {
    this.gatewayConfig = gatewayConfig;
  }

  attachRuntime(
    runtime: RuntimeLike,
    services: AppServices,
    gatewayConfig = this.gatewayConfig,
  ): void {
    this.runtime = runtime;
    this.services = services;
    this.gatewayConfig = gatewayConfig;
    this.controlPlaneCache = undefined;
    this.snapshotValue = undefined;
    this.snapshotPromise = undefined;
  }

  updateGatewayConfig(gatewayConfig: GatewayConfig): void {
    this.gatewayConfig = gatewayConfig;
    this.controlPlaneCache = undefined;
    this.snapshotValue = undefined;
    this.snapshotPromise = undefined;
  }

  controlPlane(force = false): NativeOwnershipControlPlane | undefined {
    if (!this.runtime || !this.services) {
      return undefined;
    }
    if (force || !this.controlPlaneCache) {
      this.controlPlaneCache = getNativeOwnershipControlPlane(
        this.runtime,
        this.services,
        this.config,
        this.gatewayConfig,
      );
    }
    return this.controlPlaneCache;
  }

  async snapshot(force = false): Promise<NativeOwnershipSnapshot | undefined> {
    if (!this.runtime || !this.services) {
      return undefined;
    }
    if (!force && this.snapshotValue) {
      return this.snapshotValue;
    }
    if (!force && this.snapshotPromise) {
      return this.snapshotPromise;
    }
    const snapshotPromise = getNativeOwnershipSnapshot(
      this.runtime,
      this.services,
      this.config,
      this.gatewayConfig,
    )
      .then((snapshot) => {
        if (this.snapshotPromise === snapshotPromise) {
          this.snapshotValue = snapshot;
        }
        return snapshot;
      })
      .finally(() => {
        if (this.snapshotPromise === snapshotPromise) {
          this.snapshotPromise = undefined;
        }
      });
    this.snapshotPromise = snapshotPromise;
    return snapshotPromise;
  }
}
