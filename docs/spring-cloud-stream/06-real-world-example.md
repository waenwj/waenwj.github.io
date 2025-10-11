---
sidebar_position: 6
---

# 实战案例：电商订单系统

通过一个完整的电商订单系统案例，综合运用 Spring Cloud Stream 的各种特性。

## 系统架构

我们将构建一个包含以下服务的订单处理系统：

```
订单服务 → [创建订单] → 订单队列
                           ↓
              [订单处理器] → 分发到不同队列
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
    库存服务          支付服务            通知服务
```

## 项目结构

```
order-system/
├── order-service/      # 订单服务
├── inventory-service/  # 库存服务
├── payment-service/    # 支付服务
├── notification-service/ # 通知服务
└── common/            # 公共模块
```

## 公共模块

### 1. 消息实体类

```java title="common/src/main/java/com/example/common/model/Order.java"
package com.example.common.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Order {
    private String orderId;
    private String userId;
    private List<OrderItem> items;
    private BigDecimal totalAmount;
    private OrderStatus status;
    private LocalDateTime createdAt;
    private String paymentMethod;
}
```

```java title="common/src/main/java/com/example/common/model/OrderItem.java"
package com.example.common.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderItem {
    private String productId;
    private String productName;
    private Integer quantity;
    private BigDecimal price;
}
```

```java title="common/src/main/java/com/example/common/model/OrderStatus.java"
package com.example.common.model;

public enum OrderStatus {
    CREATED,           // 已创建
    INVENTORY_CHECKED, // 库存已检查
    PAYMENT_PENDING,   // 待支付
    PAYMENT_SUCCESS,   // 支付成功
    PAYMENT_FAILED,    // 支付失败
    COMPLETED,         // 已完成
    CANCELLED          // 已取消
}
```

### 2. 事件类

```java title="common/src/main/java/com/example/common/event/OrderEvent.java"
package com.example.common.event;

import com.example.common.model.Order;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderEvent {
    private String eventId;
    private String eventType;
    private Order order;
    private LocalDateTime timestamp;
    private String source;
}
```

## 订单服务

### 1. 依赖配置

```xml title="order-service/pom.xml"
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-stream</artifactId>
    </dependency>
    
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-stream-binder-rabbit</artifactId>
    </dependency>
    
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    
    <dependency>
        <groupId>com.h2database</groupId>
        <artifactId>h2</artifactId>
        <scope>runtime</scope>
    </dependency>
    
    <dependency>
        <groupId>com.example</groupId>
        <artifactId>common</artifactId>
        <version>1.0.0</version>
    </dependency>
</dependencies>
```

### 2. 订单实体和仓库

```java title="order-service/src/main/java/com/example/order/entity/OrderEntity.java"
package com.example.order.entity;

import com.example.common.model.OrderStatus;
import lombok.Data;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "orders")
@Data
public class OrderEntity {
    
    @Id
    private String orderId;
    
    private String userId;
    
    private BigDecimal totalAmount;
    
    @Enumerated(EnumType.STRING)
    private OrderStatus status;
    
    private LocalDateTime createdAt;
    
    private String paymentMethod;
    
    @Column(columnDefinition = "TEXT")
    private String itemsJson;  // 存储 JSON 格式的商品列表
}
```

```java title="order-service/src/main/java/com/example/order/repository/OrderRepository.java"
package com.example.order.repository;

import com.example.order.entity.OrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<OrderEntity, String> {
}
```

### 3. 订单服务

```java title="order-service/src/main/java/com/example/order/service/OrderService.java"
package com.example.order.service;

import com.example.common.event.OrderEvent;
import com.example.common.model.Order;
import com.example.common.model.OrderStatus;
import com.example.order.entity.OrderEntity;
import com.example.order.repository.OrderRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.stream.function.StreamBridge;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {
    
    private final OrderRepository orderRepository;
    private final StreamBridge streamBridge;
    private final ObjectMapper objectMapper;
    
    /**
     * 创建订单
     */
    @Transactional
    public Order createOrder(Order order) {
        // 生成订单ID
        order.setOrderId(UUID.randomUUID().toString());
        order.setStatus(OrderStatus.CREATED);
        order.setCreatedAt(LocalDateTime.now());
        
        // 保存到数据库
        OrderEntity entity = convertToEntity(order);
        orderRepository.save(entity);
        
        // 发送订单创建事件
        publishOrderEvent("ORDER_CREATED", order);
        
        log.info("订单创建成功: {}", order.getOrderId());
        return order;
    }
    
    /**
     * 更新订单状态
     */
    @Transactional
    public void updateOrderStatus(String orderId, OrderStatus status) {
        OrderEntity entity = orderRepository.findById(orderId)
            .orElseThrow(() -> new RuntimeException("订单不存在"));
        
        entity.setStatus(status);
        orderRepository.save(entity);
        
        // 发送状态更新事件
        Order order = convertToOrder(entity);
        publishOrderEvent("ORDER_STATUS_UPDATED", order);
        
        log.info("订单状态更新: {} -> {}", orderId, status);
    }
    
    /**
     * 发布订单事件
     */
    private void publishOrderEvent(String eventType, Order order) {
        OrderEvent event = new OrderEvent(
            UUID.randomUUID().toString(),
            eventType,
            order,
            LocalDateTime.now(),
            "order-service"
        );
        
        streamBridge.send("order-events", event);
    }
    
    private OrderEntity convertToEntity(Order order) {
        OrderEntity entity = new OrderEntity();
        entity.setOrderId(order.getOrderId());
        entity.setUserId(order.getUserId());
        entity.setTotalAmount(order.getTotalAmount());
        entity.setStatus(order.getStatus());
        entity.setCreatedAt(order.getCreatedAt());
        entity.setPaymentMethod(order.getPaymentMethod());
        
        try {
            entity.setItemsJson(objectMapper.writeValueAsString(order.getItems()));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("序列化订单项失败", e);
        }
        
        return entity;
    }
    
    private Order convertToOrder(OrderEntity entity) {
        Order order = new Order();
        order.setOrderId(entity.getOrderId());
        order.setUserId(entity.getUserId());
        order.setTotalAmount(entity.getTotalAmount());
        order.setStatus(entity.getStatus());
        order.setCreatedAt(entity.getCreatedAt());
        order.setPaymentMethod(entity.getPaymentMethod());
        
        try {
            order.setItems(objectMapper.readValue(
                entity.getItemsJson(),
                objectMapper.getTypeFactory().constructCollectionType(
                    List.class, com.example.common.model.OrderItem.class)
            ));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("反序列化订单项失败", e);
        }
        
        return order;
    }
}
```

### 4. REST 控制器

```java title="order-service/src/main/java/com/example/order/controller/OrderController.java"
package com.example.order.controller;

import com.example.common.model.Order;
import com.example.order.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {
    
    private final OrderService orderService;
    
    /**
     * 创建订单
     */
    @PostMapping
    public ResponseEntity<Order> createOrder(@RequestBody Order order) {
        Order createdOrder = orderService.createOrder(order);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdOrder);
    }
}
```

### 5. 配置文件

```yaml title="order-service/src/main/resources/application.yml"
spring:
  application:
    name: order-service
  
  cloud:
    stream:
      bindings:
        # 订单事件输出
        order-events:
          destination: order.events
          content-type: application/json
      
      rabbit:
        bindings:
          order-events:
            producer:
              exchange-type: topic
              routing-key-expression: "headers['eventType']"
  
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest
  
  datasource:
    url: jdbc:h2:mem:orderdb
    driver-class-name: org.h2.Driver
  
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true

server:
  port: 8081

logging:
  level:
    com.example: DEBUG
```

## 库存服务

### 1. 库存检查处理器

```java title="inventory-service/src/main/java/com/example/inventory/service/InventoryService.java"
package com.example.inventory.service;

import com.example.common.event.OrderEvent;
import com.example.common.model.Order;
import com.example.common.model.OrderItem;
import com.example.common.model.OrderStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.stream.function.StreamBridge;
import org.springframework.context.annotation.Bean;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryService {
    
    private final StreamBridge streamBridge;
    
    // 模拟库存数据
    private final Map<String, Integer> inventory = new ConcurrentHashMap<>();
    
    {
        // 初始化一些库存
        inventory.put("product-1", 100);
        inventory.put("product-2", 50);
        inventory.put("product-3", 200);
    }
    
    /**
     * 监听订单创建事件
     */
    @Bean
    public Consumer<OrderEvent> orderCreatedListener() {
        return event -> {
            if ("ORDER_CREATED".equals(event.getEventType())) {
                log.info("收到订单创建事件: {}", event.getOrder().getOrderId());
                checkInventory(event.getOrder());
            }
        };
    }
    
    /**
     * 检查库存
     */
    private void checkInventory(Order order) {
        boolean available = true;
        
        // 检查所有商品库存
        for (OrderItem item : order.getItems()) {
            Integer stock = inventory.getOrDefault(item.getProductId(), 0);
            if (stock < item.getQuantity()) {
                available = false;
                log.warn("库存不足: {} 需要 {}, 可用 {}", 
                    item.getProductId(), item.getQuantity(), stock);
                break;
            }
        }
        
        if (available) {
            // 扣减库存
            for (OrderItem item : order.getItems()) {
                inventory.computeIfPresent(item.getProductId(), 
                    (k, v) -> v - item.getQuantity());
            }
            
            // 发送库存检查成功事件
            order.setStatus(OrderStatus.INVENTORY_CHECKED);
            publishEvent("INVENTORY_CHECKED", order);
            log.info("库存检查通过: {}", order.getOrderId());
        } else {
            // 发送库存不足事件
            order.setStatus(OrderStatus.CANCELLED);
            publishEvent("INVENTORY_INSUFFICIENT", order);
            log.warn("库存不足，订单取消: {}", order.getOrderId());
        }
    }
    
    /**
     * 发布事件
     */
    private void publishEvent(String eventType, Order order) {
        OrderEvent event = new OrderEvent(
            UUID.randomUUID().toString(),
            eventType,
            order,
            LocalDateTime.now(),
            "inventory-service"
        );
        
        Message<OrderEvent> message = MessageBuilder
            .withPayload(event)
            .setHeader("eventType", eventType)
            .build();
        
        streamBridge.send("inventory-events", message);
    }
}
```

### 2. 配置文件

```yaml title="inventory-service/src/main/resources/application.yml"
spring:
  application:
    name: inventory-service
  
  cloud:
    stream:
      function:
        definition: orderCreatedListener
      
      bindings:
        # 监听订单事件
        orderCreatedListener-in-0:
          destination: order.events
          group: inventory-service
          content-type: application/json
        
        # 发送库存事件
        inventory-events:
          destination: inventory.events
          content-type: application/json
      
      rabbit:
        bindings:
          orderCreatedListener-in-0:
            consumer:
              # 只接收 ORDER_CREATED 事件
              binding-routing-key: ORDER_CREATED
  
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest

server:
  port: 8082

logging:
  level:
    com.example: DEBUG
```

## 支付服务

### 1. 支付处理器

```java title="payment-service/src/main/java/com/example/payment/service/PaymentService.java"
package com.example.payment.service;

import com.example.common.event.OrderEvent;
import com.example.common.model.Order;
import com.example.common.model.OrderStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.stream.function.StreamBridge;
import org.springframework.context.annotation.Bean;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.UUID;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentService {
    
    private final StreamBridge streamBridge;
    private final Random random = new Random();
    
    /**
     * 监听库存检查事件
     */
    @Bean
    public Consumer<OrderEvent> inventoryCheckedListener() {
        return event -> {
            if ("INVENTORY_CHECKED".equals(event.getEventType())) {
                log.info("收到库存检查通过事件: {}", event.getOrder().getOrderId());
                processPayment(event.getOrder());
            }
        };
    }
    
    /**
     * 处理支付
     */
    private void processPayment(Order order) {
        log.info("开始处理支付: {}, 金额: {}", 
            order.getOrderId(), order.getTotalAmount());
        
        try {
            // 模拟支付处理时间
            Thread.sleep(2000);
            
            // 模拟支付成功/失败（90% 成功率）
            boolean success = random.nextInt(10) < 9;
            
            if (success) {
                order.setStatus(OrderStatus.PAYMENT_SUCCESS);
                publishEvent("PAYMENT_SUCCESS", order);
                log.info("支付成功: {}", order.getOrderId());
            } else {
                order.setStatus(OrderStatus.PAYMENT_FAILED);
                publishEvent("PAYMENT_FAILED", order);
                log.warn("支付失败: {}", order.getOrderId());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            order.setStatus(OrderStatus.PAYMENT_FAILED);
            publishEvent("PAYMENT_FAILED", order);
            log.error("支付处理异常: {}", order.getOrderId(), e);
        }
    }
    
    /**
     * 发布事件
     */
    private void publishEvent(String eventType, Order order) {
        OrderEvent event = new OrderEvent(
            UUID.randomUUID().toString(),
            eventType,
            order,
            LocalDateTime.now(),
            "payment-service"
        );
        
        Message<OrderEvent> message = MessageBuilder
            .withPayload(event)
            .setHeader("eventType", eventType)
            .build();
        
        streamBridge.send("payment-events", message);
    }
}
```

### 2. 配置文件

```yaml title="payment-service/src/main/resources/application.yml"
spring:
  application:
    name: payment-service
  
  cloud:
    stream:
      function:
        definition: inventoryCheckedListener
      
      bindings:
        # 监听库存事件
        inventoryCheckedListener-in-0:
          destination: inventory.events
          group: payment-service
          content-type: application/json
        
        # 发送支付事件
        payment-events:
          destination: payment.events
          content-type: application/json
      
      rabbit:
        bindings:
          inventoryCheckedListener-in-0:
            consumer:
              binding-routing-key: INVENTORY_CHECKED
              # 重试配置
              max-attempts: 3
              back-off-initial-interval: 1000
  
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest

server:
  port: 8083

logging:
  level:
    com.example: DEBUG
```

## 通知服务

### 1. 通知处理器

```java title="notification-service/src/main/java/com/example/notification/service/NotificationService.java"
package com.example.notification.service;

import com.example.common.event.OrderEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Service;

import java.util.function.Consumer;

@Service
@Slf4j
public class NotificationService {
    
    /**
     * 监听所有订单相关事件
     */
    @Bean
    public Consumer<OrderEvent> allEventsListener() {
        return event -> {
            String eventType = event.getEventType();
            String orderId = event.getOrder().getOrderId();
            String userId = event.getOrder().getUserId();
            
            switch (eventType) {
                case "ORDER_CREATED":
                    sendNotification(userId, 
                        String.format("订单 %s 已创建", orderId));
                    break;
                
                case "INVENTORY_CHECKED":
                    sendNotification(userId, 
                        String.format("订单 %s 库存已确认，等待支付", orderId));
                    break;
                
                case "INVENTORY_INSUFFICIENT":
                    sendNotification(userId, 
                        String.format("订单 %s 因库存不足已取消", orderId));
                    break;
                
                case "PAYMENT_SUCCESS":
                    sendNotification(userId, 
                        String.format("订单 %s 支付成功", orderId));
                    sendEmail(userId, "订单支付成功", orderId);
                    break;
                
                case "PAYMENT_FAILED":
                    sendNotification(userId, 
                        String.format("订单 %s 支付失败，请重试", orderId));
                    break;
                
                default:
                    log.info("收到未处理的事件: {}", eventType);
            }
        };
    }
    
    /**
     * 发送通知（模拟）
     */
    private void sendNotification(String userId, String message) {
        log.info("[通知] 用户 {} 收到消息: {}", userId, message);
        // 实际实现中，这里会调用推送服务 API
    }
    
    /**
     * 发送邮件（模拟）
     */
    private void sendEmail(String userId, String subject, String orderId) {
        log.info("[邮件] 发送给用户 {}, 主题: {}, 订单: {}", 
            userId, subject, orderId);
        // 实际实现中，这里会调用邮件服务
    }
}
```

### 2. 配置文件

```yaml title="notification-service/src/main/resources/application.yml"
spring:
  application:
    name: notification-service
  
  cloud:
    stream:
      function:
        definition: allEventsListener
      
      bindings:
        # 监听所有事件（不指定消费者组，每个实例都收到）
        allEventsListener-in-0:
          destination: order.events,inventory.events,payment.events
          content-type: application/json
      
      rabbit:
        bindings:
          allEventsListener-in-0:
            consumer:
              # 绑定所有路由键
              binding-routing-key: '#'
  
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest

server:
  port: 8084

logging:
  level:
    com.example: DEBUG
```

## 测试系统

### 1. 启动服务

```bash
# 启动 RabbitMQ
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# 启动各个服务
cd order-service && mvn spring-boot:run
cd inventory-service && mvn spring-boot:run
cd payment-service && mvn spring-boot:run
cd notification-service && mvn spring-boot:run
```

### 2. 创建测试订单

```bash
curl -X POST http://localhost:8081/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "items": [
      {
        "productId": "product-1",
        "productName": "商品A",
        "quantity": 2,
        "price": 99.99
      },
      {
        "productId": "product-2",
        "productName": "商品B",
        "quantity": 1,
        "price": 199.99
      }
    ],
    "totalAmount": 399.97,
    "paymentMethod": "CREDIT_CARD"
  }'
```

### 3. 观察日志

你会看到各个服务按顺序处理订单：

```
[订单服务] 订单创建成功: xxx
[库存服务] 收到订单创建事件: xxx
[库存服务] 库存检查通过: xxx
[支付服务] 收到库存检查通过事件: xxx
[支付服务] 开始处理支付: xxx, 金额: 399.97
[支付服务] 支付成功: xxx
[通知服务] [通知] 用户 user-123 收到消息: 订单 xxx 已创建
[通知服务] [通知] 用户 user-123 收到消息: 订单 xxx 支付成功
[通知服务] [邮件] 发送给用户 user-123, 主题: 订单支付成功
```

## 监控和可视化

访问 RabbitMQ 管理界面 http://localhost:15672 查看：

- 交换机和队列的创建情况
- 消息流转情况
- 消费者连接状态

## 系统优化建议

### 1. 添加分布式追踪

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-sleuth</artifactId>
</dependency>
```

### 2. 添加断路器

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-circuitbreaker-resilience4j</artifactId>
</dependency>
```

### 3. 使用 Saga 模式处理分布式事务

### 4. 添加监控指标

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

## 小结

通过这个实战案例，我们学习了：

- ✅ 如何设计事件驱动的微服务架构
- ✅ 服务间通过消息队列异步通信
- ✅ 使用消费者组实现负载均衡
- ✅ 使用路由键过滤特定事件
- ✅ 错误处理和重试机制
- ✅ 系统监控和日志追踪

这个案例展示了 Spring Cloud Stream 在实际项目中的应用，你可以在此基础上进行扩展和优化。

:::tip 提示
完整的源代码可以在 GitHub 上找到。建议动手实践，加深理解。
:::

