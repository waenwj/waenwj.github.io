---
sidebar_position: 4
---

# 配置详解

全面了解 Spring Cloud Stream 的各种配置选项，优化你的消息驱动应用。

## 配置层次结构

Spring Cloud Stream 的配置分为三个层次：

```
全局配置
  ↓
Binder 配置
  ↓
绑定配置（Binding）
```

下层配置会覆盖上层配置。

## 全局配置

### 基本配置

```yaml
spring:
  cloud:
    stream:
      # 默认的 Binder（如果有多个）
      default-binder: rabbit
      
      # 实例相关配置（用于分区）
      instance-count: 3
      instance-index: 0
      
      # 动态目的地配置
      dynamic-destinations:
        - dynamic-topic-*
```

### 函数定义

```yaml
spring:
  cloud:
    stream:
      function:
        # 定义要绑定的函数
        definition: consumer;supplier;processor
        
        # 函数组合
        # definition: upperCase|reverse  # 先转大写，再反转
```

## 绑定配置

### 通用绑定属性

```yaml
spring:
  cloud:
    stream:
      bindings:
        messageConsumer-in-0:
          # 目的地（队列/主题名称）
          destination: my-topic
          
          # 内容类型
          content-type: application/json
          
          # Binder 名称（多 Binder 场景）
          binder: rabbit
          
          # 消费者组
          group: my-group
```

### 消费者配置

```yaml
spring:
  cloud:
    stream:
      bindings:
        input-channel:
          consumer:
            # 最大重试次数
            max-attempts: 3
            
            # 重试间隔（毫秒）
            back-off-initial-interval: 1000
            back-off-max-interval: 10000
            back-off-multiplier: 2.0
            
            # 并发消费者数量
            concurrency: 3
            
            # 是否启用分区
            partitioned: false
            
            # 消息头模式
            header-mode: headers
            
            # 是否使用原生解码
            use-native-decoding: false
```

### 生产者配置

```yaml
spring:
  cloud:
    stream:
      bindings:
        output-channel:
          producer:
            # 分区配置
            partition-count: 3
            partition-key-expression: headers['userId']
            
            # 是否需要同步响应
            required-groups: group1,group2
            
            # 消息头模式
            header-mode: headers
            
            # 是否使用原生编码
            use-native-encoding: false
            
            # 错误通道是否启用
            error-channel-enabled: true
```

## RabbitMQ Binder 配置

### 连接配置

```yaml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest
    virtual-host: /
    
    # 连接超时
    connection-timeout: 60000
    
    # 发布确认
    publisher-confirm-type: correlated
    publisher-returns: true
    
    # 连接池
    cache:
      channel:
        size: 25
        checkout-timeout: 5000
    
    # 监听器配置
    listener:
      simple:
        acknowledge-mode: auto
        prefetch: 250
        concurrency: 3
        max-concurrency: 10
```

### RabbitMQ 特定绑定配置

```yaml
spring:
  cloud:
    stream:
      rabbit:
        bindings:
          messageConsumer-in-0:
            consumer:
              # 队列持久化
              durable-subscription: true
              
              # 自动创建死信队列
              auto-bind-dlq: true
              
              # 死信队列名称
              dead-letter-queue-name: error-queue
              
              # 死信交换机
              dead-letter-exchange: DLX
              
              # 消息 TTL（毫秒）
              ttl: 60000
              
              # 最大长度
              max-length: 1000
              
              # 消息优先级
              max-priority: 10
              
              # 预取数量
              prefetch: 100
              
              # 是否重新发布到死信队列
              republish-to-dlq: true
              
              # 重新排队被拒绝的消息
              requeue-rejected: false
              
              # 事务管理
              transacted: false
          
          messageSupplier-out-0:
            producer:
              # 交换机类型
              exchange-type: topic
              
              # 路由键表达式
              routing-key-expression: headers['routingKey']
              
              # 是否自动绑定
              auto-bind-dlq: true
              
              # 批量配置
              batch-enabled: false
              batch-size: 100
              batch-timeout: 5000
              
              # 压缩
              compress: false
              
              # 延迟消息
              delayed-exchange: false
```

### RabbitMQ 全局配置

```yaml
spring:
  cloud:
    stream:
      rabbit:
        default:
          consumer:
            auto-bind-dlq: true
            republish-to-dlq: true
          producer:
            exchange-type: topic
```

## Kafka Binder 配置

### 连接配置

```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    
    # 生产者配置
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.apache.kafka.common.serialization.StringSerializer
      acks: all
      retries: 3
      batch-size: 16384
      buffer-memory: 33554432
    
    # 消费者配置
    consumer:
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      group-id: my-group
      auto-offset-reset: earliest
      enable-auto-commit: true
      auto-commit-interval: 1000
      max-poll-records: 500
```

### Kafka 特定绑定配置

```yaml
spring:
  cloud:
    stream:
      kafka:
        bindings:
          messageConsumer-in-0:
            consumer:
              # 自动提交偏移量
              auto-commit-offset: true
              
              # 从哪里开始消费
              start-offset: earliest  # earliest, latest
              
              # 启用死信队列
              enable-dlq: true
              dlq-name: error-topic
              
              # 消息转换器
              converters:
                - myConverter
              
              # 并发数
              concurrency: 3
              
              # 批量处理
              batch-mode: true
          
          messageSupplier-out-0:
            producer:
              # 消息键表达式
              message-key-expression: headers['key']
              
              # 分区配置
              partition-count: 10
              
              # 压缩类型
              compression: gzip  # none, gzip, snappy, lz4, zstd
              
              # 批量配置
              batch-size: 16384
              
              # 缓冲区大小
              buffer-size: 33554432
```

## 多 Binder 配置

当应用需要同时使用多个消息中间件时：

```yaml
spring:
  cloud:
    stream:
      # 默认 Binder
      default-binder: rabbit
      
      # 定义多个 Binder
      binders:
        rabbit:
          type: rabbit
          environment:
            spring:
              rabbitmq:
                host: localhost
                port: 5672
        
        kafka:
          type: kafka
          environment:
            spring:
              kafka:
                bootstrap-servers: localhost:9092
      
      bindings:
        # 使用 RabbitMQ
        input1-in-0:
          destination: rabbit-topic
          binder: rabbit
        
        # 使用 Kafka
        input2-in-0:
          destination: kafka-topic
          binder: kafka
```

## 错误处理配置

### 全局错误处理

```yaml
spring:
  cloud:
    stream:
      bindings:
        messageConsumer-in-0:
          consumer:
            # 最大重试次数
            max-attempts: 3
            
            # 退避策略
            back-off-initial-interval: 1000
            back-off-max-interval: 10000
            back-off-multiplier: 2.0
```

### 自定义错误处理器

```java
@Bean
public Consumer<Message<?>> myErrorHandler() {
    return message -> {
        log.error("处理消息失败: {}", message);
        // 自定义错误处理逻辑
    };
}
```

配置错误处理器：

```yaml
spring:
  cloud:
    stream:
      bindings:
        messageConsumer-in-0:
          consumer:
            # 绑定错误处理器
            error-handler-definition: myErrorHandler
```

## 消息转换配置

### 自定义消息转换器

```java
@Configuration
public class MessageConverterConfig {
    
    @Bean
    public MessageConverter customMessageConverter() {
        return new AbstractMessageConverter(
            new MimeType("application", "custom")) {
            
            @Override
            protected boolean supports(Class<?> clazz) {
                return MyClass.class.equals(clazz);
            }
            
            @Override
            protected Object convertFromInternal(
                Message<?> message, 
                Class<?> targetClass, 
                Object conversionHint) {
                // 反序列化逻辑
                return deserialize(message.getPayload());
            }
            
            @Override
            protected Object convertToInternal(
                Object payload, 
                MessageHeaders headers,
                Object conversionHint) {
                // 序列化逻辑
                return serialize(payload);
            }
        };
    }
}
```

## 监控和健康检查配置

### 启用监控端点

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,bindings,channels
  
  endpoint:
    health:
      show-details: always
  
  health:
    binders:
      enabled: true
```

### 自定义健康指标

```java
@Component
public class CustomHealthIndicator implements HealthIndicator {
    
    @Override
    public Health health() {
        // 检查应用健康状态
        boolean healthy = checkHealth();
        
        if (healthy) {
            return Health.up()
                .withDetail("custom", "All good")
                .build();
        } else {
            return Health.down()
                .withDetail("custom", "Something wrong")
                .build();
        }
    }
}
```

## 性能优化配置

### 提高吞吐量

```yaml
spring:
  cloud:
    stream:
      bindings:
        input:
          consumer:
            # 增加并发数
            concurrency: 10
            
            # 增加预取数量
            prefetch: 500
      
      rabbit:
        bindings:
          input:
            consumer:
              # 批量确认
              acknowledge-mode: auto
              
              # 增加预取数量
              prefetch: 250
```

### 减少延迟

```yaml
spring:
  cloud:
    stream:
      rabbit:
        bindings:
          input:
            consumer:
              # 减少预取数量
              prefetch: 1
              
              # 立即确认
              acknowledge-mode: auto
```

## 环境特定配置

使用 Spring Profile 管理不同环境的配置：

```yaml
# application.yml
spring:
  profiles:
    active: dev

---
# application-dev.yml
spring:
  rabbitmq:
    host: localhost
  cloud:
    stream:
      bindings:
        input:
          destination: dev-topic

---
# application-prod.yml
spring:
  rabbitmq:
    host: prod-rabbitmq.example.com
  cloud:
    stream:
      bindings:
        input:
          destination: prod-topic
```

## 配置最佳实践

### 1. 使用配置类管理复杂配置

```java
@Configuration
@ConfigurationProperties(prefix = "app.stream")
public class StreamConfig {
    private String destination;
    private int concurrency;
    private int prefetch;
    
    // getters and setters
}
```

### 2. 外部化敏感配置

```yaml
spring:
  rabbitmq:
    host: ${RABBITMQ_HOST:localhost}
    username: ${RABBITMQ_USERNAME:guest}
    password: ${RABBITMQ_PASSWORD:guest}
```

### 3. 使用配置元数据

创建 `additional-spring-configuration-metadata.json`：

```json
{
  "properties": [
    {
      "name": "spring.cloud.stream.bindings.input.destination",
      "type": "java.lang.String",
      "description": "消息目的地名称"
    }
  ]
}
```

### 4. 文档化配置

```yaml
spring:
  cloud:
    stream:
      bindings:
        input:
          # 用途：接收订单消息
          # 预期消息格式：JSON
          # 消费者组：确保每条消息只被处理一次
          destination: order-topic
          group: order-service
```

## 小结

本章详细介绍了：

- ✅ 配置的层次结构
- ✅ RabbitMQ 和 Kafka Binder 的详细配置
- ✅ 多 Binder 场景的配置
- ✅ 错误处理和消息转换配置
- ✅ 性能优化配置
- ✅ 配置管理的最佳实践

下一章我们将学习如何处理实际场景中的各种挑战。

:::tip 提示
合理的配置是应用稳定运行的基础，建议根据实际业务需求调整配置参数。
:::

