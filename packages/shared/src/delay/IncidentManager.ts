import { CorridorIncident } from '@mumbai-timetable/types';

/**
 * ==============================================================================
 * LAYER 3: OFFICIAL INCIDENT & OPERATIONAL ALERT INGESTION MANAGER
 * ==============================================================================
 * Ingests official Railway notices, signal failures, OHE power blocks,
 * and technical snag bulletins from Central/Western Railway operational controls.
 */
export class IncidentManager {
  private incidents: Map<string, CorridorIncident> = new Map();

  /**
   * Register or update an active incident.
   */
  public addIncident(incident: CorridorIncident): void {
    if (!incident || !incident.id) return;
    this.incidents.set(incident.id, incident);
  }

  /**
   * Remove an incident by ID.
   */
  public removeIncident(id: string): boolean {
    return this.incidents.delete(id);
  }

  /**
   * Get all currently active incidents.
   */
  public getActiveIncidents(): CorridorIncident[] {
    const now = Date.now();
    const active: CorridorIncident[] = [];
    for (const inc of this.incidents.values()) {
      if (inc.isActive && inc.startTime <= now && inc.endTime >= now) {
        active.push(inc);
      }
    }
    return active;
  }

  /**
   * Find any active incident matching a train's corridor, direction, and route stations.
   * Returns the maximum incident delay in minutes applicable to this train.
   */
  public getIncidentDelayForTrain(
    corridor?: string,
    direction: 'UP' | 'DN' = 'DN',
    isFast: boolean = false,
    routeStationIds: string[] = []
  ): { delayMinutes: number; incident?: CorridorIncident } {
    const activeIncidents = this.getActiveIncidents();
    if (activeIncidents.length === 0) {
      return { delayMinutes: 0 };
    }

    let maxDelay = 0;
    let matchingIncident: CorridorIncident | undefined;

    const trackType = isFast ? 'FAST' : 'SLOW';

    for (const inc of activeIncidents) {
      // 1. Corridor match (if corridor is provided, or matches all)
      if (corridor && inc.corridor && inc.corridor !== 'ALL' && inc.corridor !== corridor) {
        continue;
      }

      // 2. Direction match
      if (inc.direction !== 'BOTH' && inc.direction !== direction) {
        continue;
      }

      // 3. Track type match
      if (inc.trackType !== 'ALL' && inc.trackType !== trackType) {
        continue;
      }

      // 4. Section overlap match (if section stations are specified)
      if (inc.sectionFromStationId || inc.sectionToStationId) {
        if (routeStationIds.length > 0) {
          const hasFrom = inc.sectionFromStationId ? routeStationIds.includes(inc.sectionFromStationId) : true;
          const hasTo = inc.sectionToStationId ? routeStationIds.includes(inc.sectionToStationId) : true;
          if (!hasFrom && !hasTo) {
            continue;
          }
        }
      }

      if (inc.delayMinutes > maxDelay) {
        maxDelay = inc.delayMinutes;
        matchingIncident = inc;
      }
    }

    return { delayMinutes: maxDelay, incident: matchingIncident };
  }
}
