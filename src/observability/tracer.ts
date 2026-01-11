import { randomUUID } from 'crypto';
import type {
  EvalTrace,
  ToolCall,
  Question,
  Decision,
  TraceError,
  TestFailure,
  IntrospectionTrace,
  GenerationTrace,
  ExecutionTrace,
} from './types.js';

export class Tracer {
  private trace: EvalTrace;
  private currentToolCall?: { name: string; input: unknown; startTime: number };
  private startTime: number;

  constructor(evalId: string) {
    this.startTime = Date.now();
    this.trace = {
      id: randomUUID(),
      evalId,
      startedAt: new Date().toISOString(),
      completedAt: '',
      duration: 0,
      status: 'success',
      introspection: {
        filesAnalyzed: [],
        totalFunctions: 0,
        totalClasses: 0,
        duration: 0,
      },
      analysis: {
        promptTokens: 0,
        completionTokens: 0,
        toolCalls: [],
        questionsAsked: [],
        decisions: [],
      },
      generation: {
        scenariosGenerated: 0,
        filesWritten: [],
      },
      execution: {
        testsPassed: 0,
        testsFailed: 0,
        testsSkipped: 0,
        failures: [],
      },
      errors: [],
    };
  }

  get traceId(): string {
    return this.trace.id;
  }

  recordToolStart(name: string, input: unknown): void {
    this.currentToolCall = { name, input, startTime: Date.now() };
  }

  recordToolEnd(name: string, output: unknown): void {
    if (this.currentToolCall?.name === name) {
      const toolCall: ToolCall = {
        timestamp: new Date().toISOString(),
        tool: name,
        input: this.currentToolCall.input,
        output,
        duration: Date.now() - this.currentToolCall.startTime,
      };
      this.trace.analysis.toolCalls.push(toolCall);
      this.currentToolCall = undefined;
    }
  }

  recordQuestion(question: Question): void {
    this.trace.analysis.questionsAsked.push({
      ...question,
      timestamp: new Date().toISOString(),
    });
  }

  recordAnswer(questionId: string, answer: string): void {
    const question = this.trace.analysis.questionsAsked.find(q => q.id === questionId);
    if (question) {
      question.answer = answer;
    }
  }

  recordDecision(
    type: Decision['type'],
    subject: string,
    reasoning: string,
    confidence: number
  ): void {
    this.trace.analysis.decisions.push({
      timestamp: new Date().toISOString(),
      type,
      subject,
      reasoning,
      confidence: Math.max(0, Math.min(1, confidence)),
    });
  }

  recordIntrospection(data: Partial<IntrospectionTrace>): void {
    Object.assign(this.trace.introspection, data);
  }

  recordGeneration(data: Partial<GenerationTrace>): void {
    Object.assign(this.trace.generation, data);
  }

  recordExecution(data: Partial<ExecutionTrace>): void {
    Object.assign(this.trace.execution, data);
  }

  recordTestFailure(failure: TestFailure): void {
    this.trace.execution.failures.push(failure);
    this.trace.execution.testsFailed++;
  }

  recordTestPass(): void {
    this.trace.execution.testsPassed++;
  }

  recordTokenUsage(promptTokens: number, completionTokens: number): void {
    this.trace.analysis.promptTokens += promptTokens;
    this.trace.analysis.completionTokens += completionTokens;
  }

  recordError(error: Error, context?: string): void {
    const traceError: TraceError = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context,
    };
    this.trace.errors.push(traceError);
    
    if (this.trace.status === 'success') {
      this.trace.status = 'partial';
    }
  }

  setStatus(status: EvalTrace['status']): void {
    this.trace.status = status;
  }

  finalize(): EvalTrace {
    this.trace.completedAt = new Date().toISOString();
    this.trace.duration = Date.now() - this.startTime;
    
    if (this.trace.errors.length > 0 && this.trace.execution.testsPassed === 0) {
      this.trace.status = 'failed';
    }
    
    return this.trace;
  }

  getTrace(): EvalTrace {
    return { ...this.trace };
  }
}

export function createTracer(evalId: string): Tracer {
  return new Tracer(evalId);
}
