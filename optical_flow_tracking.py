#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
光流追踪算法实现
支持 Lucas-Kanade 和 Farneback 两种光流算法
"""

import cv2
import numpy as np
import matplotlib.pyplot as plt


class OpticalFlowTracker:
    """光流追踪器类"""
    
    def __init__(self, method='lucas_kanade', max_features=100, quality_level=0.01,
                 min_distance=10, window_size=3):
        """
        初始化光流追踪器
        
        参数:
            method: 光流算法类型 ('lucas_kanade' 或 'farneback')
            max_features: 最大特征点数量
            quality_level: 特征点质量阈值
            min_distance: 特征点最小距离
            window_size: 光流计算窗口大小
        """
        self.method = method
        self.max_features = max_features
        self.quality_level = quality_level
        self.min_distance = min_distance
        self.window_size = window_size
        
        # 存储特征点
        self.prev_frame = None
        self.prev_points = None
        
    def detect_features(self, frame):
        """
        检测特征点
        
        参数:
            frame: 输入图像
            
        返回:
            特征点坐标数组
        """
        # 转换为灰度图
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 检测角点特征
        features = cv2.goodFeaturesToTrack(
            gray,
            maxCorners=self.max_features,
            qualityLevel=self.quality_level,
            minDistance=self.min_distance,
            blockSize=3,
            useHarrisDetector=True,
            k=0.04
        )
        
        return features.reshape(-1, 2)
    
    def track_lucas_kanade(self, frame, points):
        """
        Lucas-Kanade 光流追踪
        
        参数:
            frame: 当前帧图像
            points: 待追踪的特征点
            
        返回:
            追踪后的新特征点
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 计算光流
        new_points, status, error = cv2.calcOpticalFlowPyrLK(
            self.prev_frame,
            gray,
            points,
            None,
            winSize=(self.window_size, self.window_size),
            maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03)
        )
        
        # 只保留成功追踪的点
        valid_points = points[status == 1]
        valid_new_points = new_points[status == 1]
        
        return valid_new_points, valid_points
    
    def track_farneback(self, frame):
        """
        Farneback 稠密光流追踪
        
        参数:
            frame: 当前帧图像
            
        返回:
            光流场
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 计算稠密光流
        flow = cv2.calcOpticalFlowFarneback(
            self.prev_frame,
            gray,
            None,
            pyr_scale=0.5,
            levels=3,
            winsize=15,
            iterations=3,
            poly_n=5,
            poly_sigma=1.2,
            flags=0
        )
        
        return flow
    
    def draw_flow(self, frame, flow):
        """
        绘制光流场
        
        参数:
            frame: 图像
            flow: 光流场
            
        返回:
            带光流线的图像
        """
        h, w = flow.shape[:2]
        lines = []
        colors = []
        
        for y in range(0, h, 25):
            for x in range(0, w, 25):
                fx, fy = flow[y, x]
                lines.append([[x, y], [x + int(fx), y + int(fy)]])
                colors.append(np.random.randint(0, 255, 3).tolist())
        
        # 绘制光流线
        for line, color in zip(lines, colors):
            cv2.line(frame, tuple(line[0]), tuple(line[1]), color, 1)
        
        return frame
    
    def draw_points(self, frame, points, color=(0, 255, 0), radius=5):
        """
        绘制特征点
        
        参数:
            frame: 图像
            points: 特征点坐标
            color: 点的颜色
            radius: 点的半径
            
        返回:
            带特征点的图像
        """
        for point in points:
            x, y = point.astype(int)
            cv2.circle(frame, (x, y), radius, color, -1)
        
        return frame
    
    def process_frame(self, frame, draw=True):
        """
        处理单帧图像
        
        参数:
            frame: 输入图像
            draw: 是否绘制结果
            
        返回:
            处理后的图像和特征点
        """
        if self.prev_frame is None:
            # 第一帧：检测特征点
            self.prev_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            self.prev_points = self.detect_features(frame)
            result = frame.copy()
            
            if draw:
                result = self.draw_points(result, self.prev_points)
                cv2.putText(result, 'First Frame', (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            return result, self.prev_points
        
        # 计算光流
        if self.method == 'lucas_kanade':
            new_points, old_points = self.track_lucas_kanade(frame, self.prev_points)
            
            # 可视化追踪结果
            result = frame.copy()
            
            if draw:
                # 绘制旧点和追踪线
                for (new_pt, old_pt) in zip(new_points, old_points):
                    x1, y1 = old_pt.astype(int)
                    x2, y2 = new_pt.astype(int)
                    cv2.line(result, (x1, y1), (x2, y2), (0, 255, 0), 1)
                    cv2.circle(result, (x1, y1), 5, (0, 255, 0), -1)
                    cv2.circle(result, (x2, y2), 5, (255, 0, 0), -1)
                
                # 绘制追踪距离
                for (new_pt, old_pt) in zip(new_points, old_points):
                    x1, y1 = old_pt.astype(int)
                    x2, y2 = new_pt.astype(int)
                    distance = np.sqrt((x2-x1)**2 + (y2-y1)**2)
                    cv2.putText(result, f'{distance:.1f}px', (x1, y1-10),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                
                cv2.putText(result, f'Tracked: {len(new_points)}/{len(old_points)}',
                           (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # 更新状态
            self.prev_points = new_points
            self.prev_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            return result, new_points
        
        elif self.method == 'farneback':
            flow = self.track_farneback(frame)
            
            result = frame.copy()
            
            if draw:
                result = self.draw_flow(result, flow)
                cv2.putText(result, 'Farneback Dense Flow', (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # 更新状态
            self.prev_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            return result, flow
        
        else:
            raise ValueError(f"Unknown method: {self.method}")


def track_video(video_path, method='lucas_kanade'):
    """
    追踪视频文件
    
    参数:
        video_path: 视频文件路径
        method: 光流算法类型
    """
    tracker = OpticalFlowTracker(method=method)
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"无法打开视频文件：{video_path}")
        return
    
    frame_count = 0
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    print(f"视频信息：{total_frames}帧, {fps}fps")
    
    while True:
        ret, frame = cap.read()
        
        if not ret:
            break
        
        # 处理帧
        result, points = tracker.process_frame(frame)
        
        # 显示结果
        cv2.imshow('Optical Flow Tracking', result)
        
        # 退出条件
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
        
        frame_count += 1
        print(f"\r处理帧：{frame_count}/{total_frames}", end='', flush=True)
    
    cap.release()
    cv2.destroyAllWindows()
    print(f"\n完成！共处理 {frame_count} 帧")


def create_demo_video(output_path='demo.mp4', duration=5, fps=30):
    """
    创建演示视频用于测试
    
    参数:
        output_path: 输出视频路径
        duration: 视频时长（秒）
        fps: 帧率
    """
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (640, 480))
    
    tracker = OpticalFlowTracker(method='lucas_kanade')
    
    for t in range(int(duration * fps)):
        # 创建测试图像（移动的背景）
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        
        # 绘制移动的物体
        x = int(100 + 100 * np.sin(t * 0.1))
        y = int(240 + 100 * np.cos(t * 0.1))
        
        # 绘制圆形
        cv2.circle(frame, (x, y), 30, (255, 0, 0), -1)
        
        # 绘制方框
        cv2.rectangle(frame, (x-50, y-50), (x+50, y+50), (0, 255, 0), 2)
        
        # 追踪
        result, points = tracker.process_frame(frame)
        out.write(result)
        
        if t % 30 == 0:
            print(f"创建演示视频帧：{t}/{int(duration * fps)}")
    
    out.release()
    print(f"演示视频已保存：{output_path}")


def visualize_optical_flow():
    """
    可视化光流算法效果对比
    """
    print("创建可视化对比图...")
    
    # 创建测试图像
    img1 = np.zeros((400, 600, 3), dtype=np.uint8)
    img2 = np.zeros((400, 600, 3), dtype=np.uint8)
    
    # 在 img1 中绘制物体
    cv2.circle(img1, (100, 200), 30, (255, 0, 0), -1)
    cv2.rectangle(img1, (50, 150), (150, 250), (0, 255, 0), 2)
    cv2.putText(img1, 'Frame 1', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    
    # 在 img2 中移动物体
    cv2.circle(img2, (200, 200), 30, (255, 0, 0), -1)
    cv2.rectangle(img2, (150, 150), (250, 250), (0, 255, 0), 2)
    cv2.putText(img2, 'Frame 2', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    
    # Lucas-Kanade 光流
    lk_tracker = OpticalFlowTracker(method='lucas_kanade')
    lk_result, lk_points = lk_tracker.process_frame(img2)
    
    # Farneback 光流
    fb_tracker = OpticalFlowTracker(method='farneback')
    fb_result, fb_flow = fb_tracker.process_frame(img2)
    
    # 创建对比图
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    axes[0, 0].imshow(img1)
    axes[0, 0].set_title('Original Frame 1')
    axes[0, 0].axis('off')
    
    axes[0, 1].imshow(img2)
    axes[0, 1].set_title('Original Frame 2')
    axes[0, 1].axis('off')
    
    axes[1, 0].imshow(cv2.cvtColor(lk_result, cv2.COLOR_BGR2RGB))
    axes[1, 0].set_title('Lucas-Kanade Sparse Flow')
    axes[1, 0].axis('off')
    
    axes[1, 1].imshow(cv2.cvtColor(fb_result, cv2.COLOR_BGR2RGB))
    axes[1, 1].set_title('Farneback Dense Flow')
    axes[1, 1].axis('off')
    
    plt.tight_layout()
    plt.savefig('optical_flow_comparison.png', dpi=150, bbox_inches='tight')
    print("可视化对比图已保存：optical_flow_comparison.png")
    plt.show()


def main():
    """主函数"""
    print("=" * 60)
    print("光流追踪算法演示")
    print("=" * 60)
    
    # 选项
    print("\n请选择操作:")
    print("1. 创建演示视频")
    print("2. 可视化光流算法对比")
    print("3. 追踪视频文件 (需要指定视频路径)")
    print("4. 退出")
    
    choice = input("\n请输入选项 (1-4): ").strip()
    
    if choice == '1':
        # 创建演示视频
        print("\n创建演示视频...")
        create_demo_video()
        
        # 测试追踪演示视频
        print("\n测试追踪演示视频...")
        track_video('demo.mp4', method='lucas_kanade')
        
    elif choice == '2':
        # 可视化对比
        visualize_optical_flow()
        
    elif choice == '3':
        # 追踪视频
        video_path = input("请输入视频路径: ").strip()
        method = input("选择算法 (lucas_kanade/farneback, 默认 lucas_kanade): ").strip()
        
        if method == '':
            method = 'lucas_kanade'
        
        print(f"\n使用 {method} 算法追踪视频...")
        track_video(video_path, method=method)
        
    elif choice == '4':
        print("退出程序")
        return
    
    print("\n" + "=" * 60)
    print("完成!")
    print("=" * 60)


if __name__ == '__main__':
    main()
