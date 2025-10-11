---
sidebar_position: 2
---

# 快速开始

本章将带你创建第一个 Spring Cloud Stream 应用，实现消息的发送和接收。

## 环境准备

### 1. 安装 Java

确保已安装 Java 17 或更高版本：

```bash
java -version
```

### 2. 安装 RabbitMQ（可选）

本教程使用 RabbitMQ 作为消息中间件。你可以使用 Docker 快速启动：

```bash
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

访问 http://localhost:15672 查看管理界面（用户名/密码：guest/guest）

:::tip 提示
Spring Cloud Stream 也支持使用内存队列进行测试，无需安装 RabbitMQ。
:::

## 创建项目

### 1. 使用 Spring Initializr

访问 [Spring Initializr](https://start.spring.io/) 创建项目，或使用以下配置：

- **Project**: Maven
- **Language**: Java
- **Spring Boot**: 3.2.x
- **Group**: com.example
- **Artifact**: stream-demo
- **Java**: 17

### 2. 添加依赖

在 `pom.xml` 中添加以下依赖：

```xml title="pom.xml"
<dependencies>
    <!-- Spring Boot Web -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    
    <!-- Spring Cloud Stream -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-stream</artifactId>
    </dependency>
    
    <!-- RabbitMQ Binder -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-stream-binder-rabbit</artifactId>
    </dependency>
    
    <!-- Lombok（可选） -->
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <optional>true</optional>
    </dependency>
</dependencies>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-dependencies</artifactId>
            <version>2023.0.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

## 编写代码

### 1. 创建消息实体类

```java title="src/main/java/com/example/streamdemo/Message.java"
package com.example.streamdemo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Message {
    private String id;
    private String content;
    private Long timestamp;
}
```

### 2. 创建消息生产者

使用函数式编程模型创建消息生产者：

```java title="src/main/java/com/example/streamdemo/MessageProducer.java"
package com.example.streamdemo;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

import java.util.function.Supplier;

@Configuration
public class MessageProducer {

    // 创建一个 Sink，用于手动发送消息
    private final Sinks.Many<Message> sink = Sinks.many()
        .multicast()
        .onBackpressureBuffer();

    /**
     * 定义消息供应者
     * 函数名 "messageSupplier" 将作为输出绑定的名称
     */
    @Bean
    public Supplier<Flux<Message>> messageSupplier() {
        return () -> sink.asFlux();
    }

    /**
     * 发送消息的方法
     */
    public void sendMessage(Message message) {
        sink.tryEmitNext(message);
    }
}
```

### 3. 创建消息消费者

```java title="src/main/java/com/example/streamdemo/MessageConsumer.java"
package com.example.streamdemo;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.function.Consumer;

@Slf4j
@Configuration
public class MessageConsumer {

    /**
     * 定义消息消费者
     * 函数名 "messageConsumer" 将作为输入绑定的名称
     */
    @Bean
    public Consumer<Message> messageConsumer() {
        return message -> {
            log.info("收到消息: {}", message);
            // 这里处理业务逻辑
        };
    }
}
```

### 4. 创建 REST 控制器

提供一个 REST 接口用于发送消息：

```java title="src/main/java/com/example/streamdemo/MessageController.java"
package com.example.streamdemo;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
public class MessageController {

    private final MessageProducer messageProducer;

    @PostMapping
    public String sendMessage(@RequestBody String content) {
        Message message = new Message(
            UUID.randomUUID().toString(),
            content,
            System.currentTimeMillis()
        );
        
        messageProducer.sendMessage(message);
        return "消息已发送: " + message.getId();
    }
}
```

## 配置文件

在 `application.yml` 中配置 Spring Cloud Stream：

```yaml title="src/main/resources/application.yml"
spring:
  application:
    name: stream-demo
  
  cloud:
    stream:
      # 函数定义
      function:
        definition: messageSupplier;messageConsumer
      
      # 绑定配置
      bindings:
        # 输出绑定（生产者）
        messageSupplier-out-0:
          destination: demo-topic
          content-type: application/json
        
        # 输入绑定（消费者）
        messageConsumer-in-0:
          destination: demo-topic
          content-type: application/json
          group: demo-group
      
      # RabbitMQ 特定配置
      rabbit:
        bindings:
          messageConsumer-in-0:
            consumer:
              auto-bind-dlq: true  # 自动创建死信队列
              durable-subscription: true  # 持久化订阅

  # RabbitMQ 连接配置
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest

server:
  port: 8080

logging:
  level:
    org.springframework.cloud.stream: DEBUG
```

:::info 配置说明
- `definition`: 定义要使用的函数（用分号分隔）
- `destination`: 消息目的地（队列/主题名称）
- `content-type`: 消息内容类型
- `group`: 消费者组名称（用于负载均衡）
:::

## 运行应用

### 1. 启动应用

```bash
mvn spring-boot:run
```

### 2. 发送消息

使用 curl 发送消息：

```bash
curl -X POST http://localhost:8080/api/messages \
  -H "Content-Type: application/json" \
  -d "Hello Spring Cloud Stream!"
```

### 3. 查看日志

你应该能在控制台看到类似的输出：

```
收到消息: Message(id=xxx, content=Hello Spring Cloud Stream!, timestamp=xxx)
```

## 验证消息队列

访问 RabbitMQ 管理界面 [http://localhost:15672](http://localhost:15672)

你会看到：

- 创建了名为 `demo-topic` 的 Exchange
- 创建了对应的队列
- 可以查看消息的发送和接收情况

## 常见问题

### 问题 1：连接 RabbitMQ 失败

**解决方案**：
- 检查 RabbitMQ 是否正在运行
- 确认配置文件中的连接信息是否正确
- 检查防火墙设置

### 问题 2：消息没有被消费

**解决方案**：
- 检查函数定义是否正确
- 确认绑定配置中的 destination 是否一致
- 查看日志中是否有错误信息

### 问题 3：如何在没有 RabbitMQ 的情况下测试？

**解决方案**：

使用 Spring Cloud Stream Test Binder：

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream-test-binder</artifactId>
    <scope>test</scope>
</dependency>
```

## 下一步

恭喜！你已经成功创建了第一个 Spring Cloud Stream 应用。在下一章中，我们将深入学习：

- 消息绑定的详细配置
- 不同的消息模式
- 错误处理机制
- 消息分区和消费组

:::tip 小贴士
完整的示例代码可以在 [GitHub](https://github.com/spring-cloud-samples) 上找到。
:::

