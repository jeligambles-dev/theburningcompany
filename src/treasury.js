export class TreasuryManager {
  constructor() {
    this.totalAllocated = 0;
    this.weeklyAllocated = 0;
    this.weeklyBurned = 0;
    this.weeklyFees = 0;
    this.allocations = [];
    this.weekStart = this.getWeekStart();
  }

  getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.setDate(diff)).toISOString().slice(0, 10);
  }

  /**
   * Reset weekly counters if we're in a new week
   */
  checkWeekReset() {
    const currentWeek = this.getWeekStart();
    if (currentWeek !== this.weekStart) {
      this.weeklyAllocated = 0;
      this.weeklyBurned = 0;
      this.weeklyFees = 0;
      this.weekStart = currentWeek;
    }
  }

  /**
   * Record a treasury allocation from a burn event
   */
  addAllocation(solAmount) {
    this.checkWeekReset();
    this.totalAllocated += solAmount;
    this.weeklyAllocated += solAmount;
    this.allocations.push({
      amount: solAmount,
      timestamp: Date.now(),
      status: "pending",
    });
    // Keep only last 100
    if (this.allocations.length > 100) this.allocations.length = 100;
  }

  /**
   * Record burn stats for weekly report
   */
  recordBurn(tokensBurned, feesCollected) {
    this.checkWeekReset();
    this.weeklyBurned += tokensBurned;
    this.weeklyFees += feesCollected;
  }

  /**
   * Get data for the weekly treasury report tweet
   */
  getWeeklyReport() {
    this.checkWeekReset();
    return {
      weeklyFees: this.weeklyFees,
      weeklyBurned: this.weeklyBurned,
      weeklyTreasury: this.weeklyAllocated,
      allocations: this.allocations
        .filter((a) => a.status !== "pending")
        .map((a) => a.category)
        .filter(Boolean),
    };
  }

  getStats() {
    return {
      totalAllocated: this.totalAllocated,
      weeklyAllocated: this.weeklyAllocated,
      weeklyBurned: this.weeklyBurned,
      weeklyFees: this.weeklyFees,
      weekStart: this.weekStart,
      recentAllocations: this.allocations.slice(0, 10),
    };
  }
}
