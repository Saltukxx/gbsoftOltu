import { AIServiceClient } from '@/services/aiClient';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AI Service Client', () => {
  let aiClient: AIServiceClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock axios.create to return a mock instance
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    aiClient = new AIServiceClient();
  });

  describe('Health Check', () => {
    it('should mark service as healthy after successful health check', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'healthy' }
      });

      await (aiClient as any).performHealthCheck();
      
      const status = aiClient.getHealthStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.consecutiveFailures).toBe(0);
    });

    it('should mark service as unhealthy after consecutive failures', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockRejectedValue(new Error('Connection failed'));

      // Simulate multiple consecutive failures
      for (let i = 0; i < 6; i++) {
        try {
          await (aiClient as any).performHealthCheck();
        } catch (error) {
          // Expected to fail
        }
      }
      
      const status = aiClient.getHealthStatus();
      expect(status.isHealthy).toBe(false);
      expect(status.consecutiveFailures).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should return fallback data for shift generation when service is unhealthy', async () => {
      // Mark service as unhealthy
      (aiClient as any).isHealthy = false;

      const testData = {
        employees: [],
        constraints: {},
        period: { start_date: '2023-01-01', end_date: '2023-01-07' }
      };

      const result = await aiClient.generateShiftPlan(testData);
      
      expect(result).toHaveProperty('schedule');
      expect(result).toHaveProperty('metrics');
      expect(result.recommendations).toContain('Manual scheduling recommended due to AI service unavailability');
    });

    it('should return fallback data for fuel prediction when service fails', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      const testData = {
        historical_data: [
          { fuel_consumed: 50 },
          { fuel_consumed: 60 },
          { fuel_consumed: 55 }
        ],
        prediction_period: {
          start_date: '2023-01-01',
          end_date: '2023-01-03'
        }
      };

      const result = await aiClient.predictFuelConsumption(testData);
      
      expect(result).toHaveProperty('predicted_consumption');
      expect(result).toHaveProperty('confidence');
      expect(result.confidence).toBeLessThan(1); // Fallback should have low confidence
      expect(result.factors).toContain('Historical average used due to AI service unavailability');
    });

    it('should calculate emissions fallback using standard factors', async () => {
      (aiClient as any).isHealthy = false;

      const testData = {
        fuel_consumption: 100 // liters
      };

      const result = await aiClient.estimateEmissions(testData);
      
      expect(result).toHaveProperty('estimated_emissions');
      expect(result.estimated_emissions).toBe(100 * 2.31); // Standard emission factor
      expect(result).toHaveProperty('note');
      expect(result.note).toContain('Standard emission factors used');
    });
  });

  describe('Request Handling', () => {
    it('should make correct API calls when service is healthy', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { schedule: [], metrics: {} }
      });

      (aiClient as any).isHealthy = true;
      (aiClient as any).client = mockAxiosInstance;

      const testData = {
        employees: [],
        constraints: {},
        period: { start_date: '2023-01-01', end_date: '2023-01-07' }
      };

      await aiClient.generateShiftPlan(testData);
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ai/shifts/generate', testData);
    });

    it('should handle network timeouts gracefully', async () => {
      const mockAxiosInstance = mockedAxios.create();
      const timeoutError = new Error('timeout of 30000ms exceeded');
      timeoutError.name = 'TimeoutError';
      
      mockAxiosInstance.post = jest.fn().mockRejectedValue(timeoutError);
      (aiClient as any).client = mockAxiosInstance;

      const testData = { fuel_consumption: 100 };
      const result = await aiClient.estimateEmissions(testData);
      
      // Should return fallback data
      expect(result).toHaveProperty('estimated_emissions');
      expect(result.note).toContain('Standard emission factors used');
    });
  });

  describe('Circuit Breaker', () => {
    it('should reset health status when explicitly requested', () => {
      // Mark service as unhealthy
      (aiClient as any).isHealthy = false;
      (aiClient as any).consecutiveFailures = 10;

      aiClient.resetHealthStatus();
      
      const status = aiClient.getHealthStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.consecutiveFailures).toBe(0);
    });

    it('should track consecutive failures correctly', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('Service error'));
      
      (aiClient as any).client = mockAxiosInstance;
      (aiClient as any).isHealthy = true;

      // Make a failing request
      await aiClient.generateShiftPlan({});
      
      const status = aiClient.getHealthStatus();
      expect(status.consecutiveFailures).toBeGreaterThan(0);
    });
  });
});