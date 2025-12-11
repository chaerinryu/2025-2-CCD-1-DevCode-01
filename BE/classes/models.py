from django.db import models
from users.models import *
from dataclasses import dataclass, field
from typing import List, Dict
from lecture_docs.models import *
#stt
class Speech(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='speeches', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='speeches')
    stt = models.TextField(blank=True, null=True)
    stt_tts =  models.JSONField(blank=True, null=True)
    end_time = models.CharField(max_length=10, blank=True, null=True)  # hh:mm:ss
    duration = models.CharField(max_length=10, blank=True, null=True)
    end_time_sec = models.FloatField(default=0.0)  # 계산용
    duration_sec = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)
    @property
    def lecture(self):
        return self.page.doc.lecture
        
#노트
class Note(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='notes', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notes')  # 작성자
    content = models.TextField()
    note_tts =  models.JSONField(blank=True, null=True) 
    created_at = models.DateTimeField(auto_now_add=True)
    @property
    def lecture(self):
        return self.page.doc.lecture
#북마크
class Bookmark(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='bookmarks', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bookmarks')
    timestamp = models.CharField(max_length=10)
    timestamp_sec = models.FloatField(default=0.0)
    relative_time = models.FloatField(default=0.0, null=True, blank=True)
    text = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    @property
    def lecture(self):
        return self.page.doc.lecture
    
