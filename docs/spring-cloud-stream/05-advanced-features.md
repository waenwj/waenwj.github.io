---
sidebar_position: 5
---

# 高级特性

探索 Spring Cloud Stream 的高级功能，构建更强大和灵活的消息驱动应用。

## 动态目的地

### StreamBridge

使用 `StreamBridge` 在运行时动态发送消息到任意目的地：

```java
@Service
@RequiredArgsConstructor
public class DynamicMessageService {
    
    private final StreamBridge streamBridge;
    
    /**
     * 动态发送消息到指定目的地
     */
    public void sendToDynamicDestination(String destination, Object message) {
        streamBridge.send(destination, message);
    }
    
    /**
     * 发送带消息头的消息
     */
    public void sendWithHeaders(String destination, Object payload) {
        Message<Object> message = MessageBuilder
            .withPayload(payload)
            .setHeader("source", "dynamic-service")
            .setHeader("timestamp", System.currentTimeMillis())
            .build();
        
        streamBridge.send(destination, message);
    }
    
    /**
     * 指定特定的 Binder
     */
    public void sendWithBinder(String destination, Object message) {
        streamBridge.send(
            destination,
            "kafka",  // Binder 名称
            message
        );
    }
}
```

### 使用示例

```java
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {
    
    private final DynamicMessageService messageService;
    
    @PostMapping("/{channel}")
    public String sendNotification(
            @PathVariable String channel,
            @RequestBody NotificationRequest request) {
        
        // 根据不同渠道发送到不同的队列
        String destination = "notification-" + channel;
        messageService.sendToDynamicDestination(destination, request);
        
        return "Notification sent to " + destination;
    }
}
```

### 配置动态目的地

```yaml
spring:
  cloud:
    stream:
      # 允许动态创建目的地
      dynamic-destinations:
        - notification-*
        - alert-*
      
      # 动态绑定的默认配置
      default:
        producer:
          partition-count: 3
        consumer:
          max-attempts: 3
```

## 条件路由

根据消息内容动态路由到不同的目标。

### 使用 RoutingFunction

```java
@Configuration
public class MessageRoutingConfig {
    
    @Bean
    public Function<Message<Order>, Message<Order>> orderRouter() {
        return message -> {
            Order order = message.getPayload();
            String destination;
            
            // 根据订单金额路由
            if (order.getAmount() > 10000) {
                destination = "high-value-orders";
            } else if (order.getAmount() > 1000) {
                destination = "medium-value-orders";
            } else {
                destination = "low-value-orders";
            }
            
            return MessageBuilder
                .fromMessage(message)
                .setHeader("spring.cloud.stream.sendto.destination", destination)
                .build();
        };
    }
}
```

### 基于表达式的路由

```yaml
spring:
  cloud:
    stream:
      function:
        definition: orderRouter
        routing-expression: "headers['orderType']"
      
      bindings:
        orderRouter-in-0:
          destination: orders
        orderRouter-out-0:
          destination: routed-orders
```

### 复杂路由示例

```java
@Configuration
public class ComplexRoutingConfig {
    
    @Bean
    public Function<Flux<Message<Event>>, Flux<Message<Event>>> eventRouter() {
        return flux -> flux.map(message -> {
            Event event = message.getPayload();
            String routingKey = determineRoutingKey(event);
            
            return MessageBuilder
                .fromMessage(message)
                .setHeader("spring.cloud.stream.sendto.destination", 
                          "event-" + routingKey)
                .setHeader("routingKey", routingKey)
                .build();
        });
    }
    
    private String determineRoutingKey(Event event) {
        // 复杂的路由逻辑
        if (event.getPriority() > 8) {
            return "critical";
        } else if (event.getType().equals("SYSTEM")) {
            return "system";
        } else {
            return "normal";
        }
    }
}
```

## 消息过滤

### 消费端过滤

```java
@Configuration
public class MessageFilterConfig {
    
    @Bean
    public Function<Flux<Order>, Flux<Order>> orderFilter() {
        return flux -> flux
            .filter(order -> order.getStatus().equals("CONFIRMED"))
            .filter(order -> order.getAmount() > 100);
    }
}
```

### 使用 SpEL 表达式过滤

```yaml
spring:
  cloud:
    stream:
      bindings:
        orderFilter-in-0:
          consumer:
            # 使用 SpEL 表达式过滤消息
            condition: "headers['orderType']=='PREMIUM'"
```

### 组合过滤和处理

```java
@Bean
public Function<Flux<Message<Order>>, Flux<ProcessedOrder>> orderProcessor() {
    return flux -> flux
        // 过滤：仅处理待支付订单
        .filter(msg -> msg.getPayload().getStatus().equals("PENDING"))
        // 过滤：金额大于 0
        .filter(msg -> msg.getPayload().getAmount() > 0)
        // 处理：调用支付服务
        .flatMap(msg -> processPayment(msg.getPayload()))
        // 错误处理
        .onErrorContinue((error, obj) -> 
            log.error("处理订单失败: {}", obj, error));
}
```

## 消息批处理

### 批量发送

```java
@Service
@RequiredArgsConstructor
public class BatchMessageService {
    
    private final StreamBridge streamBridge;
    
    /**
     * 批量发送消息
     */
    public void sendBatch(List<Order> orders) {
        // 方式1：逐个发送
        orders.forEach(order -> 
            streamBridge.send("orders", order));
        
        // 方式2：作为一个批次发送
        streamBridge.send("order-batch", orders);
    }
}
```

### 批量消费

```java
@Configuration
public class BatchConsumerConfig {
    
    /**
     * 批量处理消息
     */
    @Bean
    public Consumer<List<Order>> batchOrderConsumer() {
        return orders -> {
            log.info("收到批量订单: {} 条", orders.size());
            
            // 批量处理
            processBatch(orders);
        };
    }
    
    /**
     * 使用窗口批量处理
     */
    @Bean
    public Function<Flux<Order>, Flux<List<Order>>> windowedProcessor() {
        return flux -> flux
            // 每 100 条或 5 秒为一批
            .windowTimeout(100, Duration.ofSeconds(5))
            .flatMap(window -> window.collectList())
            .filter(list -> !list.isEmpty())
            .doOnNext(batch -> log.info("处理批次: {} 条", batch.size()));
    }
}
```

配置批处理：

```yaml
spring:
  cloud:
    stream:
      bindings:
        batchOrderConsumer-in-0:
          destination: orders
          consumer:
            # 启用批量模式
            batch-mode: true
            
      rabbit:
        bindings:
          batchOrderConsumer-in-0:
            consumer:
              # 启用批量
              enable-batching: true
              batch-size: 100
              receive-timeout: 5000
```

## 消息重试和死信队列

### 配置重试策略

```java
@Configuration
public class RetryConfig {
    
    @Bean
    public Consumer<Message<Order>> orderConsumer() {
        return message -> {
            Order order = message.getPayload();
            
            try {
                processOrder(order);
            } catch (Exception e) {
                // 抛出异常触发重试
                throw new MessageHandlingException(message, e);
            }
        };
    }
}
```

配置重试参数：

```yaml
spring:
  cloud:
    stream:
      bindings:
        orderConsumer-in-0:
          destination: orders
          group: order-service
          consumer:
            # 最大重试次数
            max-attempts: 3
            
            # 初始重试间隔（毫秒）
            back-off-initial-interval: 1000
            
            # 最大重试间隔
            back-off-max-interval: 10000
            
            # 重试间隔倍数
            back-off-multiplier: 2.0
```

### 死信队列配置

```yaml
spring:
  cloud:
    stream:
      rabbit:
        bindings:
          orderConsumer-in-0:
            consumer:
              # 自动绑定死信队列
              auto-bind-dlq: true
              
              # 死信队列名称
              dead-letter-queue-name: orders.dlq
              
              # 死信交换机
              dead-letter-exchange: DLX
              
              # 死信路由键
              dead-letter-routing-key: orders.failed
              
              # 重新发布到死信队列（带错误信息）
              republish-to-dlq: true
              
              # 重新排队被拒绝的消息
              requeue-rejected: false
```

### 处理死信队列消息

```java
@Configuration
public class DlqHandler {
    
    /**
     * 监听死信队列
     */
    @Bean
    public Consumer<Message<Order>> dlqConsumer() {
        return message -> {
            Order order = message.getPayload();
            
            // 记录失败信息
            log.error("订单处理失败: {}", order.getId());
            log.error("错误信息: {}", 
                message.getHeaders().get("x-exception-message"));
            log.error("错误堆栈: {}", 
                message.getHeaders().get("x-exception-stacktrace"));
            
            // 发送告警
            sendAlert(order, message);
            
            // 持久化到数据库
            saveFailed Order(order, message);
        };
    }
}
```

## 消息延迟处理

### 延迟消息（RabbitMQ）

```yaml
spring:
  cloud:
    stream:
      rabbit:
        bindings:
          delayedMessage-out-0:
            producer:
              # 启用延迟交换机
              delayed-exchange: true
```

发送延迟消息：

```java
@Service
@RequiredArgsConstructor
public class DelayedMessageService {
    
    private final StreamBridge streamBridge;
    
    /**
     * 发送延迟消息
     */
    public void sendDelayed(Object payload, int delaySeconds) {
        Message<?> message = MessageBuilder
            .withPayload(payload)
            .setHeader("x-delay", delaySeconds * 1000)
            .build();
        
        streamBridge.send("delayed-messages", message);
    }
}
```

### 使用 TTL 实现延迟

```yaml
spring:
  cloud:
    stream:
      rabbit:
        bindings:
          delayed-in-0:
            consumer:
              # 消息 TTL（30秒后过期）
              ttl: 30000
              
              # 过期后发送到死信队列
              auto-bind-dlq: true
              dead-letter-exchange: delayed-dlx
```

## 消息追踪

### 集成 Spring Cloud Sleuth

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-sleuth</artifactId>
</dependency>
```

```java
@Bean
public Function<Message<Order>, Message<Order>> tracedProcessor() {
    return message -> {
        // Sleuth 自动添加 trace 信息到消息头
        log.info("Processing order with trace"); // 日志包含 traceId
        
        Order order = message.getPayload();
        processOrder(order);
        
        return message;
    };
}
```

### 自定义追踪信息

```java
@Service
@RequiredArgsConstructor
public class TracingService {
    
    private final StreamBridge streamBridge;
    private final Tracer tracer;
    
    public void sendWithTracing(Order order) {
        Span span = tracer.currentSpan();
        
        Message<Order> message = MessageBuilder
            .withPayload(order)
            .setHeader("traceId", span.context().traceId())
            .setHeader("spanId", span.context().spanId())
            .setHeader("source", "order-service")
            .setHeader("timestamp", System.currentTimeMillis())
            .build();
        
        streamBridge.send("orders", message);
    }
}
```

## 事务支持

### 启用事务

```yaml
spring:
  cloud:
    stream:
      rabbit:
        bindings:
          transactional-in-0:
            consumer:
              # 启用事务
              transacted: true
```

### 事务消息处理

```java
@Service
@RequiredArgsConstructor
public class TransactionalService {
    
    private final OrderRepository orderRepository;
    
    @Bean
    @Transactional
    public Consumer<Order> transactionalConsumer() {
        return order -> {
            // 数据库操作
            orderRepository.save(order);
            
            // 如果抛出异常，消息会回滚（重新入队）
            if (order.getAmount() < 0) {
                throw new IllegalArgumentException("Invalid amount");
            }
        };
    }
}
```

## 消息转换和内容类型协商

### 自定义消息转换器

```java
@Configuration
public class MessageConverterConfig {
    
    @Bean
    public MessageConverter protobufMessageConverter() {
        return new AbstractMessageConverter(
            new MimeType("application", "x-protobuf")) {
            
            @Override
            protected boolean supports(Class<?> clazz) {
                return Message.class.isAssignableFrom(clazz);
            }
            
            @Override
            protected Object convertFromInternal(
                    org.springframework.messaging.Message<?> message,
                    Class<?> targetClass,
                    Object conversionHint) {
                // Protobuf 反序列化
                return parseProtobuf(message.getPayload());
            }
            
            @Override
            protected Object convertToInternal(
                    Object payload,
                    MessageHeaders headers,
                    Object conversionHint) {
                // Protobuf 序列化
                return serializeProtobuf(payload);
            }
        };
    }
}
```

### 配置内容类型

```yaml
spring:
  cloud:
    stream:
      bindings:
        input:
          content-type: application/x-protobuf
        output:
          content-type: application/json
```

## 小结

本章介绍了 Spring Cloud Stream 的高级特性：

- ✅ 动态目的地和 StreamBridge
- ✅ 条件路由和消息过滤
- ✅ 批量处理
- ✅ 重试和死信队列
- ✅ 延迟消息
- ✅ 消息追踪
- ✅ 事务支持
- ✅ 自定义消息转换

下一章我们将通过实战项目综合运用这些知识。

:::tip 提示
这些高级特性可以帮助你构建更加健壮和灵活的消息驱动应用，但要根据实际需求选择使用。
:::

