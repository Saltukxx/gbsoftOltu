import axios, { AxiosInstance } from 'axios';
import { logger } from '@/services/logger';

export class AIServiceClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private isHealthy: boolean = true;
  private lastHealthCheck: Date = new Date();
  private healthCheckInterval: number = 30000; // 30 seconds
  private consecutiveFailures: number = 0;
  private maxFailures: number = 5;

  constructor() {
    this.baseUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    const apiKey = process.env.AI_SERVICE_API_KEY;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('AI Service Request:', {
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data,
        });
        return config;
      },
      (error) => {
        logger.error('AI Service Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('AI Service Response:', {
          status: response.status,
          url: response.config.url,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error('AI Service Error:', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
    
    // Start health check monitoring
    this.startHealthCheckMonitoring();
  }

  private async startHealthCheckMonitoring() {
    setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        // Health check errors are already logged
      }
    }, this.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      this.isHealthy = true;
      this.consecutiveFailures = 0;
      this.lastHealthCheck = new Date();
      logger.debug('AI Service health check passed');
      return true;
    } catch (error) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxFailures) {
        this.isHealthy = false;
      }
      this.lastHealthCheck = new Date();
      logger.warn('AI Service health check failed', {
        consecutiveFailures: this.consecutiveFailures,
        isHealthy: this.isHealthy,
      });
      return false;
    }
  }

  private async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallbackData?: T,
    operationName: string = 'operation'
  ): Promise<T> {
    // Check if service is healthy
    if (!this.isHealthy) {
      logger.warn(`AI Service is unhealthy, ${operationName} skipped`);
      if (fallbackData !== undefined) {
        return fallbackData;
      }
      throw new Error(`AI service is currently unavailable for ${operationName}`);
    }

    try {
      const result = await operation();
      this.consecutiveFailures = 0; // Reset on success
      return result;
    } catch (error: any) {
      this.consecutiveFailures++;
      logger.error(`AI Service ${operationName} failed:`, error);

      if (this.consecutiveFailures >= this.maxFailures) {
        this.isHealthy = false;
        logger.error('AI Service marked as unhealthy due to consecutive failures');
      }

      if (fallbackData !== undefined) {
        logger.info(`Using fallback data for ${operationName}`);
        return fallbackData;
      }

      throw new Error(`AI service unavailable for ${operationName}`);
    }
  }

  async generateShiftPlan(data: any) {
    const fallbackData = {
      schedule: [],
      metrics: {
        efficiency_score: 0.5,
        coverage: 0.8,
        balance_score: 0.7,
      },
      violations: [],
      recommendations: ['Manual scheduling recommended due to AI service unavailability'],
    };

    return this.executeWithFallback(
      async () => {
        const response = await this.client.post('/ai/shifts/generate', data);
        return response.data;
      },
      fallbackData,
      'shift generation'
    );
  }

  async analyzeShiftSchedule(data: any) {
    const fallbackData = {
      analysis: {
        efficiency_score: 0.5,
        coverage_percentage: 80,
        workload_distribution: 'balanced',
      },
      recommendations: ['Manual review recommended due to AI service unavailability'],
      issues: [],
    };

    return this.executeWithFallback(
      async () => {
        const response = await this.client.post('/ai/shifts/analyze', data);
        return response.data;
      },
      fallbackData,
      'shift schedule analysis'
    );
  }

  async predictFuelConsumption(data: any) {
    // Calculate basic fallback based on historical average
    const averageConsumption = data.historical_data?.reduce((acc: number, day: any) => 
      acc + (day.fuel_consumed || 0), 0
    ) / (data.historical_data?.length || 1) || 50;

    const periodDays = Math.ceil(
      (new Date(data.prediction_period.end_date).getTime() - 
       new Date(data.prediction_period.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    const fallbackData = {
      predicted_consumption: averageConsumption * periodDays,
      confidence: 0.3,
      factors: ['Historical average used due to AI service unavailability'],
      breakdown: {
        base_consumption: averageConsumption * periodDays,
        weather_adjustment: 0,
        route_adjustment: 0,
        seasonal_adjustment: 0,
      },
    };

    return this.executeWithFallback(
      async () => {
        const response = await this.client.post('/ai/fuel/predict', data);
        return response.data;
      },
      fallbackData,
      'fuel consumption prediction'
    );
  }

  async analyzeFuelEfficiency(data: any) {
    const fallbackData = {
      efficiency_rating: 'average',
      efficiency_score: 0.5,
      benchmarks: {
        industry_average: 0.5,
        best_practice: 0.8,
        current_performance: 0.5,
      },
      recommendations: ['Manual efficiency analysis recommended due to AI service unavailability'],
    };

    return this.executeWithFallback(
      async () => {
        const response = await this.client.post('/ai/fuel/analyze', data);
        return response.data;
      },
      fallbackData,
      'fuel efficiency analysis'
    );
  }

  async estimateEmissions(data: any) {
    // Basic emission estimation using fuel consumption
    const fuelConsumed = data.fuel_consumption || 100;
    const emissionFactor = 2.31; // kg CO2 per liter of diesel (standard factor)
    
    const fallbackData = {
      estimated_emissions: fuelConsumed * emissionFactor,
      emission_factors: {
        co2: emissionFactor,
        nox: 0.015,
        pm: 0.001,
      },
      breakdown: {
        co2: fuelConsumed * emissionFactor,
        nox: fuelConsumed * 0.015,
        particulate_matter: fuelConsumed * 0.001,
      },
      note: 'Standard emission factors used due to AI service unavailability',
    };

    return this.executeWithFallback(
      async () => {
        const response = await this.client.post('/ai/emissions/estimate', data);
        return response.data;
      },
      fallbackData,
      'emissions estimation'
    );
  }

  async calculateCarbonFootprint(data: any) {
    // Basic carbon footprint calculation
    const distance = data.distance_km || 100;
    const emissionPerKm = 0.8; // kg CO2 per km for typical municipal vehicle
    
    const fallbackData = {
      carbon_footprint: distance * emissionPerKm,
      unit: 'kg CO2',
      breakdown: {
        direct_emissions: distance * emissionPerKm,
        indirect_emissions: 0,
        offset_available: 0,
      },
      recommendations: ['Use alternative transport methods to reduce footprint'],
      note: 'Basic calculation used due to AI service unavailability',
    };

    return this.executeWithFallback(
      async () => {
        const response = await this.client.post('/ai/emissions/carbon-footprint', data);
        return response.data;
      },
      fallbackData,
      'carbon footprint calculation'
    );
  }

  async checkHealth() {
    return this.performHealthCheck();
  }

  getHealthStatus() {
    return {
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      consecutiveFailures: this.consecutiveFailures,
      baseUrl: this.baseUrl,
    };
  }

  // Force a health check reset (useful for testing or manual recovery)
  resetHealthStatus() {
    this.isHealthy = true;
    this.consecutiveFailures = 0;
    this.lastHealthCheck = new Date();
    logger.info('AI Service health status reset');
  }
}

export const aiClient = new AIServiceClient();